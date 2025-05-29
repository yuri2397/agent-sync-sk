const sql = require('mssql');

// Configuration de la connexion
const config = {
    server: 'localhost',
    user: 'sa',
    password: 'Matrix@2397!',
    options: {
        trustServerCertificate: true,
        encrypt: false,
        enableArithAbort: true,
        trustedConnection: true,
        integratedSecurity: true
    }
};

// Fonction de test
async function testConnection() {
    try {
        console.log('Tentative de connexion à SQL Server...');
        await sql.connect(config);
        console.log('Connexion réussie!');

        // Exécution d'une requête simple pour tester
        const result = await sql.query`SELECT @@VERSION as version`;
        console.log('Version SQL Server:', result.recordset[0].version);

        await sql.close();
    } catch (err) {
        console.error('Erreur de connexion:', err);
    }
}

testConnection();