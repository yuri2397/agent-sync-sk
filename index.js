/**
 * Agent de synchronisation entre SQL Server (Sage) et Laravel
 * 
 * Ce script se connecte à une base SQL Server, extrait les données des tables
 * anonymes_customers et anonymes_invoices, puis les envoie à une API Laravel.
 */

const sql = require('mssql');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Configuration du logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
            return `${timestamp} ${level.toUpperCase()}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({
            filename: path.join(__dirname, 'logs', 'sync-agent.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        })
    ]
});

// Créer le dossier de logs s'il n'existe pas
if (!fs.existsSync(path.join(__dirname, 'logs'))) {
    fs.mkdirSync(path.join(__dirname, 'logs'));
}

// Chargement de la configuration
let config;
try {
    config = require('./config.json');
    logger.info('Configuration chargée avec succès');
} catch (err) {
    logger.error(`Erreur lors du chargement de la configuration: ${err.message}`);

    // Créer un fichier de configuration par défaut
    const defaultConfig = {
        database: {
            server: 'localhost\\SQLEXPRESS',
            database: 'SAGE_COMPTA',
            user: 'sa',
            password: 'ChangeMe',
            options: {
                trustServerCertificate: true,
                encrypt: false,
                enableArithAbort: true
            }
        },
        api: {
            "url": "https://sk.digita.sn/api/sage",
            "key": "sk-digitanalh2HRpxrDVJ6bkk5Gy0iHehnf6i9Czhtiv7rG82REOENWLzK42Sv6qGW04cLz4j3hhyf44yJ3d8jShdudGl9NzvuGUfQHPkiHg1YtUL9dEWsbZ55yrJYY"
        },
        sync: {
            interval: 300, // Intervalle de synchronisation en secondes (5 minutes)
            batchSize: 50,  // Nombre d'enregistrements par lot
            deleteAfterSync: false // Supprimer ou marquer comme synchronisé
        }
    };

    fs.writeFileSync(
        path.join(__dirname, 'config.json'),
        JSON.stringify(defaultConfig, null, 2)
    );

    logger.error('Un fichier de configuration par défaut a été créé. Veuillez le modifier avant de relancer l\'application.');
    process.exit(1);
}

// Configuration de la connexion SQL Server
const sqlConfig = {
    server: config.database.server,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    options: config.database.options || {
        trustServerCertificate: true,
        encrypt: false,
        enableArithAbort: true
    }
};

// Configuration d'Axios pour l'API Laravel
const api = axios.create({
    baseURL: config.api.url,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': config.api.key
    },
    timeout: 30000 // 30 secondes
});

/**
 * Teste la connexion à la base de données
 */
async function testDatabaseConnection() {
    try {
        await sql.connect(sqlConfig);
        logger.info('Connexion à SQL Server établie avec succès');
        await sql.close();
        return true;
    } catch (err) {
        logger.error(`Erreur de connexion à SQL Server: ${err.message}`);
        return false;
    }
}

/**
 * Teste la connexion à l'API Laravel
 */
async function testApiConnection() {
    try {
        const response = await api.get('/ping');
        if (response.data && response.data.success) {
            logger.info(`Connexion à l'API Laravel établie avec succès (${response.data.message})`);
            return true;
        } else {
            logger.error(`Réponse API inattendue: ${JSON.stringify(response.data)}`);
            return false;
        }
    } catch (err) {
        logger.error(`Erreur de connexion à l'API Laravel: ${err.message}`);
        return false;
    }
}

/**
 * Synchronise les clients depuis SQL Server vers l'API Laravel
 */
async function syncCustomers() {
    let pool = null;

    try {
        // Connexion à SQL Server
        pool = await sql.connect(sqlConfig);

        // Récupérer les clients non synchronisés
        const result = await pool.request()
            .query(`SELECT TOP ${config.sync.batchSize} * FROM anonymes_customers 
              WHERE synced = 0 OR synced IS NULL`);

        const customers = result.recordset;

        if (customers.length === 0) {
            logger.info('Aucun client à synchroniser');
            return 0;
        }

        logger.info(`${customers.length} clients trouvés à synchroniser`);

        // Envoyer les clients à l'API Laravel
        const response = await api.post('/sync/customers', customers);

        if (response.data && response.data.success) {
            const successCount = response.data.data.imported + response.data.data.updated;
            logger.info(`Synchronisation réussie: ${successCount} clients traités (${response.data.data.imported} importés, ${response.data.data.updated} mis à jour)`);

            // Récupérer les IDs des clients synchronisés avec succès
            const syncedIds = response.data.data.processed
                .filter(item => item.status === 'created' || item.status === 'updated')
                .map(item => item.sage_id);

            if (syncedIds.length > 0) {
                // Construire la clause IN pour la requête SQL
                const idPlaceholders = syncedIds.map(() => '?').join(',');

                // Marquer les clients comme synchronisés
                if (config.sync.deleteAfterSync) {
                    await pool.request()
                        .query(`DELETE FROM anonymes_customers WHERE sage_id IN (${idPlaceholders})`, [...syncedIds]);
                    logger.info(`${syncedIds.length} clients supprimés après synchronisation`);
                } else {
                    await pool.request()
                        .query(`UPDATE anonymes_customers SET synced = 1, sync_date = GETDATE() WHERE sage_id IN (${idPlaceholders})`, [...syncedIds]);
                    logger.info(`${syncedIds.length} clients marqués comme synchronisés`);
                }
            }

            return successCount;
        } else {
            logger.error(`Erreur lors de la synchronisation des clients: ${JSON.stringify(response.data)}`);
            return 0;
        }
    } catch (err) {
        logger.error(`Erreur lors de la synchronisation des clients: ${err.message}`);
        return 0;
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

/**
 * Synchronise les factures depuis SQL Server vers l'API Laravel
 */
async function syncInvoices() {
    let pool = null;

    try {
        // Connexion à SQL Server
        pool = await sql.connect(sqlConfig);

        // Récupérer les factures non synchronisées
        const invoicesResult = await pool.request()
            .query(`SELECT TOP ${config.sync.batchSize} * FROM anonymes_invoices 
              WHERE synced = 0 OR synced IS NULL`);

        const invoices = invoicesResult.recordset;

        if (invoices.length === 0) {
            logger.info('Aucune facture à synchroniser');
            return 0;
        }

        logger.info(`${invoices.length} factures trouvées à synchroniser`);

        // Pour chaque facture, récupérer ses échéances
        const formattedInvoices = [];

        for (const invoice of invoices) {
            // Récupérer les échéances de la facture
            const dueDatesResult = await pool.request()
                .input('invoiceId', sql.Int, invoice.id)
                .query(`SELECT * FROM anonymes_due_dates WHERE invoice_id = @invoiceId`);

            const dueDates = dueDatesResult.recordset.map(dueDate => ({
                due_date: dueDate.due_date,
                amount: dueDate.amount
            }));

            // Formater la facture pour l'API
            formattedInvoices.push({
                sage_id: invoice.sage_id,
                invoice_number: invoice.invoice_number,
                customer_sage_id: invoice.customer_sage_id,
                reference: invoice.reference,
                type: invoice.type,
                invoice_date: invoice.invoice_date,
                currency: invoice.currency,
                total_amount: invoice.total_amount,
                notes: invoice.notes,
                created_by: invoice.created_by,
                due_dates: dueDates
            });
        }

        // Envoyer les factures à l'API Laravel
        const response = await api.post('/sync/invoices', formattedInvoices);

        if (response.data && response.data.success) {
            const successCount = response.data.data.imported + response.data.data.updated;
            logger.info(`Synchronisation réussie: ${successCount} factures traitées (${response.data.data.imported} importées, ${response.data.data.updated} mises à jour)`);

            // Récupérer les IDs des factures synchronisées avec succès
            const syncedIds = response.data.data.processed
                .filter(item => item.status === 'created' || item.status === 'updated' || item.status === 'partially_updated')
                .map(item => item.sage_id);

            if (syncedIds.length > 0) {
                // Construire la clause IN pour la requête SQL
                const idPlaceholders = syncedIds.map(() => '?').join(',');

                // Marquer les factures comme synchronisées
                if (config.sync.deleteAfterSync) {
                    await pool.request()
                        .query(`DELETE FROM anonymes_invoices WHERE sage_id IN (${idPlaceholders})`, [...syncedIds]);
                    logger.info(`${syncedIds.length} factures supprimées après synchronisation`);
                } else {
                    await pool.request()
                        .query(`UPDATE anonymes_invoices SET synced = 1, sync_date = GETDATE() WHERE sage_id IN (${idPlaceholders})`, [...syncedIds]);
                    logger.info(`${syncedIds.length} factures marquées comme synchronisées`);
                }
            }

            return successCount;
        } else {
            logger.error(`Erreur lors de la synchronisation des factures: ${JSON.stringify(response.data)}`);
            return 0;
        }
    } catch (err) {
        logger.error(`Erreur lors de la synchronisation des factures: ${err.message}`);
        return 0;
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

/**
 * Fonction principale qui exécute le cycle de synchronisation complet
 */
async function runSyncCycle() {
    try {
        logger.info('================================  DEBUT  ================================================');

        logger.info('Démarrage du cycle de synchronisation');

        // Synchroniser les clients
        const customersCount = await syncCustomers();

        // Synchroniser les factures
        const invoicesCount = await syncInvoices();

        logger.info(`Fin du cycle de synchronisation: ${customersCount} clients et ${invoicesCount} factures synchronisés`);

        logger.info('==================================  FIN  ==============================================');


    } catch (err) {
        logger.error(`Erreur lors du cycle de synchronisation: ${err.message}`);
    }
}

/**
 * Démarrage de l'application
 */
async function startApp() {
    logger.info('Démarrage de l\'agent de synchronisation SK-APP');

    // Tester les connexions
    const dbConnected = await testDatabaseConnection();
    const apiConnected = await testApiConnection();

    if (!dbConnected || !apiConnected) {
        logger.error('Impossible de démarrer l\'agent de synchronisation. Vérifiez la configuration et les connexions.');
        process.exit(1);
    }

    // Lancer le premier cycle de synchronisation
    await runSyncCycle();

    // Planifier les cycles suivants
    setInterval(runSyncCycle, config.sync.interval * 1000);
    logger.info(`Agent de synchronisation démarré. Intervalle: ${config.sync.interval} secondes`);
}

// Gérer les erreurs non capturées
process.on('uncaughtException', (err) => {
    logger.error(`Erreur non capturée: ${err.message}`);
    logger.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Promesse rejetée non gérée:');
    logger.error(reason);
});

// Démarrer l'application
startApp();