/**
 * Script d'installation du service Windows
 * 
 * Ce script installe l'agent de synchronisation comme un service Windows
 * qui démarre automatiquement au démarrage du système.
 * 
 * Prérequis:
 * - Avoir node-windows installé: npm install -g node-windows
 * - Avoir un utilisateur Windows avec les droits d'administration
 */

const Service = require('node-windows').Service;
const path = require('path');

// Définir le service
const svc = new Service({
    name: 'SageLaravelSyncAgent',
    description: 'Agent de synchronisation entre Sage Compta et Laravel',
    script: path.join(__dirname, 'index.js'),

    // Options du service
    nodeOptions: [],
    workingDirectory: __dirname,
    allowServiceLogon: true,

    // Log des erreurs et sorties
    logOnAs: {
        account: process.env.USERPROFILE.split('\\')[2],
        password: '' // Laisser vide pour saisie interactive
    },

    // Redémarrage automatique en cas d'erreur
    restartDelay: 60, // Redémarrer après 60 secondes
    maxRestarts: 5, // Nombre maximal de redémarrages automatiques

    // Démarrage automatique
    maxRetries: 3,
    stopparentfirst: true
});

// Événements d'installation
svc.on('install', function () {
    console.log('Service installé avec succès');
    console.log('Démarrage du service...');
    svc.start();
});

svc.on('start', function () {
    console.log('Service démarré avec succès');
});

svc.on('alreadyinstalled', function () {
    console.log('Service déjà installé. Désinstallation...');
    svc.uninstall();
});

svc.on('invalidinstallation', function () {
    console.log('Installation invalide détectée. Réinstallation nécessaire.');
});

svc.on('uninstall', function () {
    console.log('Service désinstallé avec succès');
    console.log('Réinstallation...');
    svc.install();
});

svc.on('error', function (err) {
    console.error('Une erreur est survenue:', err);
});

// Installer le service
console.log('Installation du service SageLaravelSyncAgent...');
svc.install();