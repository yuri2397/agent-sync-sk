-- Script SQL pour créer les triggers qui alimentent les tables tampon
-- À exécuter dans la base de données SQL Server où se trouve Sage Compta
-- Adaptez les noms des tables Sage (F_COMPTET, F_DOCENTETE, etc.) à votre version

-- Trigger pour synchroniser les clients
IF EXISTS (SELECT * FROM sys.triggers WHERE object_id = OBJECT_ID(N'[dbo].[TR_F_COMPTET_SYNC]'))
    DROP TRIGGER [dbo].[TR_F_COMPTET_SYNC];
GO

CREATE TRIGGER [dbo].[TR_F_COMPTET_SYNC]
ON [dbo].[F_COMPTET]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Insérer ou mettre à jour dans la table tampon
    MERGE INTO [dbo].[anonymes_customers] AS target
    USING (
        SELECT
            CT_Num AS sage_id,
            CT_Num AS code,
            CT_Intitule AS company_name,
            CT_Contact AS contact_name,
            CT_EMail AS email,
            CT_Telephone AS phone,
            CONCAT(CT_Adresse, ' ', CT_Complement) AS address,
            N_CatTarif AS payment_delay,
            CT_Encours AS credit_limit,
            30 AS max_days_overdue,
            CASE 
                WHEN CT_Qualite = 'FIDELE' THEN 'low'
                WHEN CT_Qualite = 'PROSPECT' THEN 'medium'
                ELSE 'high'
            END AS risk_level,
            CT_Commentaire AS notes,
            CASE WHEN CT_Sommeil = 0 THEN 1 ELSE 0 END AS is_active
        FROM inserted
    ) AS source
    ON (target.sage_id = source.sage_id)
    WHEN MATCHED THEN
        UPDATE SET 
            code = source.code,
            company_name = source.company_name,
            contact_name = source.contact_name,
            email = source.email,
            phone = source.phone,
            address = source.address,
            payment_delay = source.payment_delay,
            credit_limit = source.credit_limit,
            max_days_overdue = source.max_days_overdue,
            risk_level = source.risk_level,
            notes = source.notes,
            is_active = source.is_active,
            synced = 0,
            sync_date = NULL
    WHEN NOT MATCHED THEN
        INSERT (
            sage_id, code, company_name, contact_name, email, phone, address,
            payment_delay, credit_limit, max_days_overdue, risk_level,
            notes, is_active, synced
        )
        VALUES (
            source.sage_id, source.code, source.company_name, source.contact_name,
            source.email, source.phone, source.address, source.payment_delay,
            source.credit_limit, source.max_days_overdue,
            source.risk_level, source.notes, source.is_active, 0
        );
END;
GO

-- Trigger pour synchroniser les factures
IF EXISTS (SELECT * FROM sys.triggers WHERE object_id = OBJECT_ID(N'[dbo].[TR_F_DOCENTETE_SYNC]'))
    DROP TRIGGER [dbo].[TR_F_DOCENTETE_SYNC];
GO

CREATE TRIGGER [dbo].[TR_F_DOCENTETE_SYNC]
ON [dbo].[F_DOCENTETE]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Ne traiter que les factures (type = 6 ou 7 dans Sage)
    IF NOT EXISTS (SELECT * FROM inserted WHERE DO_Type IN (6, 7))
        RETURN;
    
    -- Insérer ou mettre à jour dans la table tampon
    MERGE INTO [dbo].[anonymes_invoices] AS target
    USING (
        SELECT
            DO_Piece AS sage_id,
            DO_Piece AS invoice_number,
            DO_Tiers AS customer_sage_id,
            DO_Ref AS reference,
            CASE 
                WHEN DO_Type = 6 THEN 'invoice'
                WHEN DO_Type = 7 THEN 'credit_note'
                ELSE 'invoice'
            END AS type,
            DO_Date AS invoice_date,
            DO_Devise AS currency,
            DO_TotalTTC AS total_amount,
            DO_Commentaire AS notes,
            DO_UserCreate AS created_by
        FROM inserted
        WHERE DO_Type IN (6, 7) -- Types de document pour factures
    ) AS source
    ON (target.sage_id = source.sage_id)
    WHEN MATCHED THEN
        UPDATE SET 
            invoice_number = source.invoice_number,
            customer_sage_id = source.customer_sage_id,
            reference = source.reference,
            type = source.type,
            invoice_date = source.invoice_date,
            total_amount = source.total_amount,
            notes = source.notes,
            created_by = source.created_by,
            synced = 0,
            sync_date = NULL
    WHEN NOT MATCHED THEN
        INSERT (
            sage_id, invoice_number, customer_sage_id, reference, type,
            invoice_date, total_amount, notes, created_by, synced
        )
        VALUES (
            source.sage_id, source.invoice_number, source.customer_sage_id,
            source.reference, source.type, source.invoice_date,
            source.total_amount, source.notes, source.created_by, 0
        );
    
    -- Insérer les échéances après avoir inséré la facture
    -- Cela suppose une table d'échéances F_ECHEANCE dans Sage
    INSERT INTO [dbo].[anonymes_due_dates] (
        invoice_id, due_date, amount, synced
    )
    SELECT 
        i.id AS invoice_id,
        e.EC_Echeance AS due_date,
        e.EC_Montant AS amount,
        0 AS synced
    FROM 
        inserted d
        INNER JOIN [dbo].[F_ECHEANCE] e ON d.DO_Piece = e.EC_Piece
        INNER JOIN [dbo].[anonymes_invoices] i ON i.sage_id = d.DO_Piece
    WHERE 
        d.DO_Type IN (6, 7) AND -- Types de document pour factures
        NOT EXISTS (
            SELECT 1 FROM [dbo].[anonymes_due_dates] dd
            INNER JOIN [dbo].[anonymes_invoices] i2 ON dd.invoice_id = i2.id
            WHERE i2.sage_id = d.DO_Piece AND dd.due_date = e.EC_Echeance
        );
END;
GO

PRINT 'Triggers de synchronisation créés avec succès';