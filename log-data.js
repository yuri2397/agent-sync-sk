// Script pour récupérer et afficher les données de SQL Server
// Utilisé pour tester la disponibilité des données dans la base
const sql = require('mssql');

// Configuration de la connexion à SQL Server
const config = {
    server: 'localhost',
    database: 'SAGE_SYNC_TEST', // Base de données créée précédemment
    user: 'sa',
    password: 'Matrix@2397!', // Remplacez par votre mot de passe
    options: {
        trustServerCertificate: true,
        encrypt: false,
        enableArithAbort: true
    }
};

// Fonction pour afficher un tableau de données formaté
function displayTable(data, title) {
    console.log(`\n=== ${title} ===`);

    if (data.length === 0) {
        console.log('Aucune donnée trouvée');
        return;
    }

    // Obtenir les noms des colonnes
    const columns = Object.keys(data[0]);

    // Déterminer la largeur de chaque colonne
    const columnWidths = {};
    columns.forEach(col => {
        columnWidths[col] = Math.max(
            col.length,
            ...data.map(row => String(row[col] !== null ? row[col] : '').length)
        );
    });

    // Créer une ligne de séparation
    const separator = '+' + columns.map(col => '-'.repeat(columnWidths[col] + 2)).join('+') + '+';

    // Afficher l'en-tête
    console.log(separator);
    console.log('|' + columns.map(col => ` ${col.padEnd(columnWidths[col])} `).join('|') + '|');
    console.log(separator);

    // Afficher les données
    data.forEach(row => {
        console.log('|' + columns.map(col => {
            const value = row[col] !== null ? row[col] : '';
            return ` ${String(value).padEnd(columnWidths[col])} `;
        }).join('|') + '|');
    });

    console.log(separator);
    console.log(`Total: ${data.length} enregistrements\n`);
}

// Fonction principale asynchrone
async function fetchAndDisplayData() {
    let pool;

    try {
        console.log('Connexion à SQL Server...');
        pool = await sql.connect(config);
        console.log('Connexion réussie!');

        // Récupérer et afficher les données des tables principales
        console.log('\n========== TABLES PRINCIPALES ==========');

        // 1. Récupérer les clients (F_COMPTET)
        const clients = await pool.request().query(`
      SELECT CT_Num, CT_Intitule, CT_Contact, CT_EMail, CT_Telephone, CT_Qualite 
      FROM F_COMPTET
    `);
        displayTable(clients.recordset, 'Clients (F_COMPTET)');

        // 2. Récupérer les factures (F_DOCENTETE)
        const invoices = await pool.request().query(`
      SELECT DO_Piece, DO_Tiers, DO_Type, DO_Date, DO_TotalHT, DO_TotalTTC
      FROM F_DOCENTETE
      ORDER BY DO_Date DESC
    `);
        displayTable(invoices.recordset, 'Factures (F_DOCENTETE)');

        // 3. Récupérer les échéances (F_ECHEANCE)
        const dueDates = await pool.request().query(`
      SELECT EC_ID, EC_Piece, EC_Echeance, EC_Montant, EC_Statut
      FROM F_ECHEANCE
      ORDER BY EC_Echeance
    `);
        displayTable(dueDates.recordset, 'Échéances (F_ECHEANCE)');

        // Récupérer et afficher les données des tables tampon
        console.log('\n========== TABLES TAMPON ==========');

        // 1. Récupérer les clients (anonymes_customers)
        const bufferClients = await pool.request().query(`
      SELECT id, sage_id, company_name, email, risk_level, synced, sync_date
      FROM anonymes_customers
    `);
        displayTable(bufferClients.recordset, 'Clients tamponnés (anonymes_customers)');

        // 2. Récupérer les factures (anonymes_invoices)
        const bufferInvoices = await pool.request().query(`
      SELECT id, sage_id, invoice_number, customer_sage_id, invoice_date, total_amount, synced
      FROM anonymes_invoices
      ORDER BY invoice_date DESC
    `);
        displayTable(bufferInvoices.recordset, 'Factures tamponnées (anonymes_invoices)');

        // 3. Récupérer les échéances (anonymes_due_dates)
        const bufferDueDates = await pool.request().query(`
      SELECT dd.id, i.sage_id AS invoice_id, dd.due_date, dd.amount, dd.synced
      FROM anonymes_due_dates dd
      JOIN anonymes_invoices i ON dd.invoice_id = i.id
      ORDER BY dd.due_date
    `);
        displayTable(bufferDueDates.recordset, 'Échéances tamponnées (anonymes_due_dates)');

        // Afficher une requête jointe pour vérifier les relations
        console.log('\n========== REQUÊTE JOINTE ==========');

        const joinedData = await pool.request().query(`
      SELECT 
        c.company_name AS client,
        i.invoice_number AS facture,
        i.invoice_date AS date_facture,
        i.total_amount AS montant_total,
        COUNT(dd.id) AS nb_echeances,
        STRING_AGG(CONVERT(VARCHAR, dd.due_date, 103), ', ') AS dates_echeances
      FROM 
        anonymes_customers c
        JOIN anonymes_invoices i ON c.sage_id = i.customer_sage_id
        JOIN anonymes_due_dates dd ON i.id = dd.invoice_id
      GROUP BY
        c.company_name, i.invoice_number, i.invoice_date, i.total_amount
      ORDER BY
        i.invoice_date DESC
    `);
        displayTable(joinedData.recordset, 'Factures avec leurs clients et échéances');

        // Afficher des statistiques
        console.log('\n========== STATISTIQUES ==========');

        const stats = await pool.request().query(`
      SELECT 
        (SELECT COUNT(*) FROM anonymes_customers) AS nb_clients,
        (SELECT COUNT(*) FROM anonymes_invoices) AS nb_factures,
        (SELECT COUNT(*) FROM anonymes_due_dates) AS nb_echeances,
        (SELECT COUNT(*) FROM anonymes_customers WHERE synced = 1) AS clients_synchronises,
        (SELECT COUNT(*) FROM anonymes_invoices WHERE synced = 1) AS factures_synchronisees,
        (SELECT SUM(total_amount) FROM anonymes_invoices) AS montant_total_factures
    `);

        const statsData = stats.recordset[0];
        console.log(`Nombre de clients: ${statsData.nb_clients}`);
        console.log(`Nombre de factures: ${statsData.nb_factures}`);
        console.log(`Nombre d'échéances: ${statsData.nb_echeances}`);
        console.log(`Clients synchronisés: ${statsData.clients_synchronises || 0}/${statsData.nb_clients}`);
        console.log(`Factures synchronisées: ${statsData.factures_synchronisees || 0}/${statsData.nb_factures}`);
        console.log(`Montant total des factures: ${statsData.montant_total_factures?.toLocaleString('fr-FR')} XOF`);

    } catch (err) {
        console.error('Erreur lors de la récupération des données:', err);
    } finally {
        if (pool) {
            await pool.close();
            console.log('\nConnexion fermée');
        }
    }
}

// Exécuter la fonction principale
fetchAndDisplayData().catch(console.error);