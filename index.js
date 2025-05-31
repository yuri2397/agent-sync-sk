/**
 * Agent de synchronisation entre SQL Server (Sage) et Laravel
 * 
 * Ce script se connecte à une base SQL Server, extrait les données des tables
 * anonymes_customers, anonymes_invoices et anonymes_due_dates, puis les envoie à une API Laravel.
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
            server: 'localhost',
            database: 'SK DISTRIBUTION ELACTRON',
            user: 'sa',
            password: 'Matrix@2397!',
            options: {
                trustServerCertificate: true,
                encrypt: false,
                enableArithAbort: true
            }
        },
        api: {
            url: 'https://sk-cloud-api-app.digita.sn/api/sage',
            key: 'sk-digitanalh2HRpxrDVJ6bkk5Gy0iHehnf6i9Czhtiv7rG82REOENWLzK42Sv6qGW04cLz4j3hhyf44yJ3d8jShdudGl9NzvuGUfQHPkiHg1YtUL9dEWsbZ55yrJYY'
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
            .query(`SELECT TOP ${config.sync.batchSize} 
                sage_id, code, company_name, contact_name, email, phone, address,
                payment_delay, currency, credit_limit, max_days_overdue, risk_level,
                notes, is_active
                FROM anonymes_customers 
                WHERE synced = 0 OR synced IS NULL
                ORDER BY id`);

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
                const idList = syncedIds.map(id => `'${id}'`).join(',');

                // Marquer les clients comme synchronisés
                if (config.sync.deleteAfterSync) {
                    await pool.request()
                        .query(`DELETE FROM anonymes_customers WHERE sage_id IN (${idList})`);
                    logger.info(`${syncedIds.length} clients supprimés après synchronisation`);
                } else {
                    await pool.request()
                        .query(`UPDATE anonymes_customers SET synced = 1, sync_date = GETDATE() WHERE sage_id IN (${idList})`);
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

        // Récupérer les factures non synchronisées avec leurs échéances
        const invoicesResult = await pool.request()
            .query(`SELECT TOP ${config.sync.batchSize} 
                i.sage_id, i.invoice_number, i.customer_sage_id, i.reference, i.type,
                i.invoice_date, i.currency, i.total_amount, i.notes, i.created_by,
                -- Sous-requête pour récupérer les échéances au format JSON
                (
                    SELECT 
                        FORMAT(dd.due_date, 'yyyy-MM-dd') AS due_date,
                        dd.amount
                    FROM anonymes_due_dates dd 
                    WHERE dd.invoice_sage_id = i.sage_id
                      AND (dd.synced = 0 OR dd.synced IS NULL)
                    ORDER BY dd.due_date
                    FOR JSON PATH
                ) AS due_dates_json
                FROM anonymes_invoices i
                WHERE (i.synced = 0 OR i.synced IS NULL)
                  AND EXISTS (
                      SELECT 1 FROM anonymes_due_dates dd 
                      WHERE dd.invoice_sage_id = i.sage_id 
                        AND (dd.synced = 0 OR dd.synced IS NULL)
                  )
                ORDER BY i.invoice_date DESC`);

        const invoices = invoicesResult.recordset;

        if (invoices.length === 0) {
            logger.info('Aucune facture à synchroniser');
            return 0;
        }

        logger.info(`${invoices.length} factures trouvées à synchroniser`);

        // Formater les factures pour l'API avec parsing des échéances JSON
        const formattedInvoices = invoices.map(invoice => ({
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
            due_dates: invoice.due_dates_json ? JSON.parse(invoice.due_dates_json) : []
        }));

        // Validation des totaux avant envoi
        let validationErrors = 0;
        formattedInvoices.forEach(invoice => {
            const totalDueDates = invoice.due_dates.reduce((sum, dd) => sum + dd.amount, 0);
            if (Math.abs(totalDueDates - invoice.total_amount) > 0.01) {
                logger.warn(`⚠️ Facture ${invoice.sage_id}: Total échéances (${totalDueDates}) ≠ Montant facture (${invoice.total_amount})`);
                validationErrors++;
            }
        });

        if (validationErrors > 0) {
            logger.warn(`⚠️ ${validationErrors} factures ont des incohérences de montants`);
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
                const idList = syncedIds.map(id => `'${id}'`).join(',');

                // Marquer les factures et échéances comme synchronisées
                if (config.sync.deleteAfterSync) {
                    await pool.request()
                        .query(`DELETE FROM anonymes_due_dates WHERE invoice_sage_id IN (${idList})`);
                    await pool.request()
                        .query(`DELETE FROM anonymes_invoices WHERE sage_id IN (${idList})`);
                    logger.info(`${syncedIds.length} factures et leurs échéances supprimées après synchronisation`);
                } else {
                    await pool.request()
                        .query(`UPDATE anonymes_invoices SET synced = 1, sync_date = GETDATE() WHERE sage_id IN (${idList})`);
                    await pool.request()
                        .query(`UPDATE anonymes_due_dates SET synced = 1, sync_date = GETDATE() WHERE invoice_sage_id IN (${idList})`);
                    logger.info(`${syncedIds.length} factures et leurs échéances marquées comme synchronisées`);
                }
            }

            return successCount;
        } else {
            logger.error(`Erreur lors de la synchronisation des factures: ${JSON.stringify(response.data)}`);
            return 0;
        }
    } catch (err) {
        logger.error(`Erreur lors de la synchronisation des factures: ${err.message}`);
        if (err.response && err.response.data) {
            logger.error(`Détails de l'erreur API: ${JSON.stringify(err.response.data)}`);
        }
        return 0;
    } finally {
        if (pool) {
            await pool.close();
        }
    }
}

/**
 * Affiche les statistiques de synchronisation
 */
async function displaySyncStats() {
    let pool = null;

    try {
        pool = await sql.connect(sqlConfig);

        const stats = await pool.request().query(`
            SELECT 
                (SELECT COUNT(*) FROM anonymes_customers) AS total_clients,
                (SELECT COUNT(*) FROM anonymes_customers WHERE synced = 1) AS clients_synchronises,
                (SELECT COUNT(*) FROM anonymes_customers WHERE synced = 0 OR synced IS NULL) AS clients_en_attente,
                (SELECT COUNT(*) FROM anonymes_invoices) AS total_factures,
                (SELECT COUNT(*) FROM anonymes_invoices WHERE synced = 1) AS factures_synchronisees,
                (SELECT COUNT(*) FROM anonymes_invoices WHERE synced = 0 OR synced IS NULL) AS factures_en_attente,
                (SELECT COUNT(*) FROM anonymes_due_dates) AS total_echeances,
                (SELECT COUNT(*) FROM anonymes_due_dates WHERE synced = 1) AS echeances_synchronisees,
                (SELECT COUNT(*) FROM anonymes_due_dates WHERE synced = 0 OR synced IS NULL) AS echeances_en_attente,
                (SELECT SUM(total_amount) FROM anonymes_invoices WHERE synced = 0 OR synced IS NULL) AS montant_en_attente
        `);

        const data = stats.recordset[0];
        
        logger.info('📊 === STATISTIQUES DE SYNCHRONISATION ===');
        logger.info(`👥 Clients: ${data.clients_synchronises}/${data.total_clients} synchronisés (${data.clients_en_attente} en attente)`);
        logger.info(`📄 Factures: ${data.factures_synchronisees}/${data.total_factures} synchronisées (${data.factures_en_attente} en attente)`);
        logger.info(`📅 Échéances: ${data.echeances_synchronisees}/${data.total_echeances} synchronisées (${data.echeances_en_attente} en attente)`);
        if (data.montant_en_attente) {
            logger.info(`💰 Montant en attente: ${data.montant_en_attente.toLocaleString('fr-FR')} XOF`);
        }
        logger.info('===============================================');

    } catch (err) {
        logger.error(`Erreur lors de l'affichage des statistiques: ${err.message}`);
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

        // Afficher les statistiques avant synchronisation
        await displaySyncStats();

        // Synchroniser les clients d'abord
        logger.info('👥 === SYNCHRONISATION DES CLIENTS ===');
        const customersCount = await syncCustomers();

        // Synchroniser les factures ensuite
        logger.info('📄 === SYNCHRONISATION DES FACTURES ===');
        const invoicesCount = await syncInvoices();

        // Afficher les statistiques après synchronisation
        await displaySyncStats();

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

// Gérer l'arrêt propre du service
process.on('SIGINT', async () => {
    logger.info('Signal d\'arrêt reçu (SIGINT)');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Signal d\'arrêt reçu (SIGTERM)');
    process.exit(0);
});

// Démarrer l'application
startApp();