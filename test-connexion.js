const sql = require('mssql');
// npm i msnodesqlv8
// Configuration de la connexion avec authentification Windows
const config = {
    server: 'PC2\\SAGE100', // nom de votre instance SQL Server
    database: 'SK DISTRIBUTION ELACTRON',
    port: 1433, // port par défaut SQL Server
    options: {
        trustedConnection: true, // Authentification Windows
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        integratedSecurity: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

async function compterElementsTable() {
    try {
        // Connexion à la base de données
        console.log('Connexion à la base de données...');
        await sql.connect(config);

        // Exécution de la requête COUNT
        const result = await sql.query('SELECT COUNT(*) as total FROM anonymes_due_dates');

        // Affichage du résultat
        const nombreElements = result.recordset[0].total;
        console.log(`Nombre d'éléments dans la table 'anonymes_due_dates' : ${nombreElements}`);

    } catch (err) {
        console.error('Erreur lors de la connexion ou de la requête :', err);
    } finally {
        // Fermeture de la connexion
        await sql.close();
        console.log('Connexion fermée.');
    }
}

// Exécution du script
compterElementsTable();