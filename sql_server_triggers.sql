-- Supprimer les triggers existants
IF EXISTS (SELECT * FROM sys.triggers WHERE object_id = OBJECT_ID(N'[dbo].[TR_F_COMPTET_SYNC]'))
    DROP TRIGGER [dbo].[TR_F_COMPTET_SYNC];

IF EXISTS (SELECT * FROM sys.triggers WHERE object_id = OBJECT_ID(N'[dbo].[TR_F_DOCENTETE_SYNC]'))
    DROP TRIGGER [dbo].[TR_F_DOCENTETE_SYNC];

IF EXISTS (SELECT * FROM sys.triggers WHERE object_id = OBJECT_ID(N'[dbo].[TR_F_ECRITUREC_SYNC]'))
    DROP TRIGGER [dbo].[TR_F_ECRITUREC_SYNC];

GO

-- Trigger pour les clients (F_COMPTET -> anonymes_customers)
CREATE TRIGGER [dbo].[TR_F_COMPTET_SYNC]
ON [dbo].[F_COMPTET]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    MERGE INTO [dbo].[anonymes_customers] AS target
    USING (
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
            CASE WHEN ISNULL(CT_Sommeil, 0) = 0 THEN 1 ELSE 0 END AS is_active
        FROM inserted
        WHERE CT_Num LIKE '411%' -- Clients seulement
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
            currency = source.currency,
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
            payment_delay, currency, credit_limit, max_days_overdue, risk_level,
            notes, is_active, synced
        )
        VALUES (
            source.sage_id, source.code, source.company_name, source.contact_name,
            source.email, source.phone, source.address, source.payment_delay,
            source.currency, source.credit_limit, source.max_days_overdue,
            source.risk_level, source.notes, source.is_active, 0
        );
END;
GO

-- Trigger pour les factures (F_DOCENTETE -> anonymes_invoices)
CREATE TRIGGER [dbo].[TR_F_DOCENTETE_SYNC]
ON [dbo].[F_DOCENTETE]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Ne traiter que les factures clients
    IF NOT EXISTS (SELECT * FROM inserted WHERE DO_Type = 7)
        RETURN;
    
    MERGE INTO [dbo].[anonymes_invoices] AS target
    USING (
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
            ISNULL(cbCreateur, 'SAGE') AS created_by
        FROM inserted
        WHERE DO_Type = 7 AND DO_Tiers LIKE '411%' -- Factures clients seulement
    ) AS source
    ON (target.sage_id = source.sage_id)
    WHEN MATCHED THEN
        UPDATE SET 
            invoice_number = source.invoice_number,
            customer_sage_id = source.customer_sage_id,
            reference = source.reference,
            type = source.type,
            invoice_date = source.invoice_date,
            currency = source.currency,
            total_amount = source.total_amount,
            notes = source.notes,
            created_by = source.created_by,
            synced = 0,
            sync_date = NULL
    WHEN NOT MATCHED THEN
        INSERT (
            sage_id, invoice_number, customer_sage_id, reference, type,
            invoice_date, currency, total_amount, notes, created_by, synced
        )
        VALUES (
            source.sage_id, source.invoice_number, source.customer_sage_id,
            source.reference, source.type, source.invoice_date, source.currency,
            source.total_amount, source.notes, source.created_by, 0
        );
END;
GO

-- Trigger pour les échéances (F_ECRITUREC -> anonymes_due_dates)
CREATE TRIGGER [dbo].[TR_F_ECRITUREC_SYNC]
ON [dbo].[F_ECRITUREC]
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Ne traiter que les échéances clients
    IF NOT EXISTS (SELECT * FROM inserted WHERE N_Reglement = 1 AND CT_Num LIKE '411%')
        RETURN;
    
    MERGE INTO [dbo].[anonymes_due_dates] AS target
    USING (
        SELECT
            CAST(EC_Piece AS NVARCHAR(50)) AS invoice_sage_id,
            CT_Num AS customer_sage_id,
            EC_No AS sage_ecriture_id,
            EC_Echeance AS due_date,
            EC_Montant AS amount,
            ISNULL(EC_StatusRegle, 0) AS status_regle,
            ISNULL(EC_MontantRegle, 0) AS montant_regle,
            CASE WHEN EC_DateRegle > '1900-01-01' THEN EC_DateRegle ELSE NULL END AS date_regle,
            EC_Reference AS reference
        FROM inserted
        WHERE N_Reglement = 1 -- Échéances seulement
          AND CT_Num LIKE '411%' -- Clients seulement
          AND EC_Echeance > '2020-01-01' -- Échéances valides
          AND EC_Montant > 0 -- Montants positifs
    ) AS source
    ON (target.sage_ecriture_id = source.sage_ecriture_id)
    WHEN MATCHED THEN
        UPDATE SET 
            invoice_sage_id = source.invoice_sage_id,
            customer_sage_id = source.customer_sage_id,
            due_date = source.due_date,
            amount = source.amount,
            status_regle = source.status_regle,
            montant_regle = source.montant_regle,
            date_regle = source.date_regle,
            reference = source.reference,
            synced = 0,
            sync_date = NULL
    WHEN NOT MATCHED THEN
        INSERT (
            invoice_sage_id, customer_sage_id, sage_ecriture_id, due_date, amount,
            status_regle, montant_regle, date_regle, reference, synced
        )
        VALUES (
            source.invoice_sage_id, source.customer_sage_id, source.sage_ecriture_id,
            source.due_date, source.amount, source.status_regle, source.montant_regle,
            source.date_regle, source.reference, 0
        );
END;
GO