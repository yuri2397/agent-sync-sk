-- =====================================================
-- SYNCHRONISATION MANUELLE DEPUIS LES TABLES SAGE
-- Popule les tables tampon avec les vraies données
-- =====================================================

DECLARE @StartTime DATETIME = GETDATE();
DECLARE @ClientsInseres INT = 0;
DECLARE @FacturesInserees INT = 0;
DECLARE @EcheancesInserees INT = 0;

PRINT '🚀 DÉBUT DE LA SYNCHRONISATION MANUELLE';
PRINT '📅 Heure de début: ' + FORMAT(@StartTime, 'dd/MM/yyyy HH:mm:ss');

BEGIN TRY
    -- =====================================================
    -- 1. SYNCHRONISATION DES CLIENTS (F_COMPTET -> anonymes_customers)
    -- =====================================================
    PRINT '';
    PRINT '👥 === SYNCHRONISATION DES CLIENTS ===';
    
    INSERT INTO [dbo].[anonymes_customers] (
        sage_id, code, company_name, contact_name, email, phone, address,
        payment_delay, currency, credit_limit, max_days_overdue, risk_level,
        notes, is_active, synced
    )
    SELECT 
        CT_Num AS sage_id,
        CT_Num AS code,
        CT_Intitule AS company_name,
        CT_Contact AS contact_name,
        CT_EMail AS email,
        CT_Telephone AS phone,
        CONCAT(ISNULL(CT_Adresse, ''), ' ', ISNULL(CT_Complement, '')) AS address,
        ISNULL(N_CatTarif, 30) AS payment_delay,
        'XOF' AS currency,
        CT_Encours AS credit_limit,
        30 AS max_days_overdue,
        CASE 
            WHEN CT_Qualite = 'FIDELE' THEN 'low'
            WHEN CT_Qualite = 'PROSPECT' THEN 'medium'
            ELSE 'high'
        END AS risk_level,
        CT_Commentaire AS notes,
        CASE WHEN ISNULL(CT_Sommeil, 0) = 0 THEN 1 ELSE 0 END AS is_active,
        0 AS synced
    FROM F_COMPTET
    WHERE CT_Num LIKE '411%' -- Clients seulement
      AND CT_Num NOT IN (SELECT sage_id FROM anonymes_customers) -- Éviter les doublons
      AND CT_Intitule IS NOT NULL; -- Clients avec nom
    
    SET @ClientsInseres = @@ROWCOUNT;
    PRINT '✅ ' + CAST(@ClientsInseres AS VARCHAR) + ' clients synchronisés';
    
    -- =====================================================
    -- 2. SYNCHRONISATION DES FACTURES (F_DOCENTETE -> anonymes_invoices)
    -- =====================================================
    PRINT '';
    PRINT '📄 === SYNCHRONISATION DES FACTURES ===';
    
    INSERT INTO [dbo].[anonymes_invoices] (
        sage_id, invoice_number, customer_sage_id, reference, type,
        invoice_date, currency, total_amount, notes, created_by, synced
    )
    SELECT 
        DO_Piece AS sage_id,
        DO_Piece AS invoice_number,
        DO_Tiers AS customer_sage_id,
        ISNULL(DO_Ref, '') AS reference,
        CASE 
            WHEN DO_Type = 7 THEN 'invoice'
            WHEN DO_Type = 6 THEN 'credit_note'
            ELSE 'invoice'
        END AS type,
        DO_Date AS invoice_date,
        'XOF' AS currency,
        DO_TotalTTC AS total_amount,
        ISNULL(DO_Ref, '') AS notes,
        ISNULL(cbCreateur, 'SAGE') AS created_by,
        0 AS synced
    FROM F_DOCENTETE
    WHERE DO_Type = 7 -- Factures clients seulement
      AND DO_Tiers LIKE '411%' -- Clients seulement
      AND DO_Piece NOT IN (SELECT sage_id FROM anonymes_invoices) -- Éviter les doublons
      AND DO_Date >= '2020-01-01' -- Factures récentes
      AND DO_TotalTTC > 0; -- Montants positifs
    
    SET @FacturesInserees = @@ROWCOUNT;
    PRINT '✅ ' + CAST(@FacturesInserees AS VARCHAR) + ' factures synchronisées';
    
    -- =====================================================
    -- 3. SYNCHRONISATION DES ÉCHÉANCES (F_ECRITUREC -> anonymes_due_dates)
    -- =====================================================
    PRINT '';
    PRINT '📅 === SYNCHRONISATION DES ÉCHÉANCES ===';
    
    INSERT INTO [dbo].[anonymes_due_dates] (
        invoice_sage_id, customer_sage_id, sage_ecriture_id, due_date, amount,
        status_regle, montant_regle, date_regle, reference, synced
    )
    SELECT DISTINCT
        CAST(EC_Piece AS NVARCHAR(50)) AS invoice_sage_id,
        CT_Num AS customer_sage_id,
        EC_No AS sage_ecriture_id,
        EC_Echeance AS due_date,
        EC_Montant AS amount,
        ISNULL(EC_StatusRegle, 0) AS status_regle,
        ISNULL(EC_MontantRegle, 0) AS montant_regle,
        CASE WHEN EC_DateRegle > '1900-01-01' THEN EC_DateRegle ELSE NULL END AS date_regle,
        EC_Reference AS reference,
        0 AS synced
    FROM F_ECRITUREC
    WHERE N_Reglement = 1 -- Échéances seulement
      AND CT_Num LIKE '411%' -- Clients seulement
      AND EC_Echeance > '2020-01-01' -- Échéances valides
      AND EC_Montant > 0 -- Montants positifs
      AND EC_No NOT IN (SELECT sage_ecriture_id FROM anonymes_due_dates) -- Éviter les doublons
      AND CAST(EC_Piece AS NVARCHAR(50)) IN (SELECT sage_id FROM anonymes_invoices); -- Seulement les factures synchronisées
    
    SET @EcheancesInserees = @@ROWCOUNT;
    PRINT '✅ ' + CAST(@EcheancesInserees AS VARCHAR) + ' échéances synchronisées';
    
    -- =====================================================
    -- 4. STATISTIQUES DE SYNCHRONISATION
    -- =====================================================
    PRINT '';
    PRINT '📊 === STATISTIQUES DE SYNCHRONISATION ===';
    
    DECLARE @TotalClients INT = (SELECT COUNT(*) FROM anonymes_customers);
    DECLARE @TotalFactures INT = (SELECT COUNT(*) FROM anonymes_invoices);
    DECLARE @TotalEcheances INT = (SELECT COUNT(*) FROM anonymes_due_dates);
    DECLARE @ClientsNonSync INT = (SELECT COUNT(*) FROM anonymes_customers WHERE synced = 0);
    DECLARE @FacturesNonSync INT = (SELECT COUNT(*) FROM anonymes_invoices WHERE synced = 0);
    DECLARE @EcheancesNonSync INT = (SELECT COUNT(*) FROM anonymes_due_dates WHERE synced = 0);
    
    SELECT 
        'RÉSUMÉ SYNCHRONISATION' AS Statistiques,
        @ClientsInseres AS clients_ajoutes,
        @FacturesInserees AS factures_ajoutees,
        @EcheancesInserees AS echeances_ajoutees,
        @TotalClients AS total_clients,
        @TotalFactures AS total_factures,
        @TotalEcheances AS total_echeances,
        @ClientsNonSync AS clients_a_synchroniser,
        @FacturesNonSync AS factures_a_synchroniser,
        @EcheancesNonSync AS echeances_a_synchroniser;
    
    -- =====================================================
    -- 5. ÉCHANTILLON DE DONNÉES POUR VALIDATION
    -- =====================================================
    PRINT '';
    PRINT '🔍 === ÉCHANTILLON DE DONNÉES ===';
    
    -- Top 5 des factures avec leurs échéances
    SELECT TOP 5
        'FACTURES AVEC ÉCHÉANCES' AS Type,
        i.sage_id AS facture,
        i.customer_sage_id AS client,
        FORMAT(i.invoice_date, 'dd/MM/yyyy') AS date_facture,
        FORMAT(i.total_amount, 'N0') + ' XOF' AS montant_facture,
        COUNT(dd.id) AS nb_echeances,
        FORMAT(SUM(dd.amount), 'N0') + ' XOF' AS total_echeances,
        CASE 
            WHEN ABS(i.total_amount - SUM(dd.amount)) < 1 THEN '✅ OK'
            ELSE '⚠️ DIFFÉRENCE: ' + FORMAT(i.total_amount - SUM(dd.amount), 'N0')
        END AS validation
    FROM anonymes_invoices i
    LEFT JOIN anonymes_due_dates dd ON dd.invoice_sage_id = i.sage_id
    GROUP BY i.sage_id, i.customer_sage_id, i.invoice_date, i.total_amount
    ORDER BY i.invoice_date DESC;
    
    -- =====================================================
    -- 6. FORMAT JSON POUR API (Échantillon)
    -- =====================================================
    PRINT '';
    PRINT '🔗 === FORMAT POUR API PHP (ÉCHANTILLON) ===';
    
    SELECT TOP 2
        i.sage_id,
        i.invoice_number,
        i.customer_sage_id,
        i.reference,
        i.type,
        FORMAT(i.invoice_date, 'yyyy-MM-dd') AS invoice_date,
        i.currency,
        i.total_amount,
        i.notes,
        i.created_by,
        (
            SELECT 
                FORMAT(dd.due_date, 'yyyy-MM-dd') AS due_date,
                dd.amount
            FROM anonymes_due_dates dd 
            WHERE dd.invoice_sage_id = i.sage_id
            FOR JSON PATH
        ) AS due_dates_json
    FROM anonymes_invoices i
    WHERE EXISTS (SELECT 1 FROM anonymes_due_dates dd WHERE dd.invoice_sage_id = i.sage_id)
    ORDER BY i.invoice_date DESC;
    
    DECLARE @EndTime DATETIME = GETDATE();
    DECLARE @Duration INT = DATEDIFF(SECOND, @StartTime, @EndTime);
    
    PRINT '';
    PRINT '🎉 SYNCHRONISATION TERMINÉE AVEC SUCCÈS !';
    PRINT '⏱️ Durée: ' + CAST(@Duration AS VARCHAR) + ' secondes';
    PRINT '📅 Heure de fin: ' + FORMAT(@EndTime, 'dd/MM/yyyy HH:mm:ss');
    
END TRY
BEGIN CATCH
    PRINT '';
    PRINT '❌ ERREUR PENDANT LA SYNCHRONISATION:';
    PRINT 'Message: ' + ERROR_MESSAGE();
    PRINT 'Ligne: ' + CAST(ERROR_LINE() AS VARCHAR);
    
    -- Rollback partiel si nécessaire (optionnel)
    -- En cas d'erreur, vous pouvez choisir de nettoyer les données partielles
    
END CATCH