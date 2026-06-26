USE CardShop;
GO

IF OBJECT_ID('dbo.PasswordResetTokens', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.PasswordResetTokens (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        UserId INT NOT NULL,
        TokenHash CHAR(64) NOT NULL UNIQUE,
        CreatedAt DATETIME2 NOT NULL DEFAULT CONVERT(datetime2, SYSUTCDATETIME() AT TIME ZONE 'UTC' AT TIME ZONE 'Central Standard Time'),
        ExpiresAt DATETIME2 NOT NULL,
        UsedAt DATETIME2 NULL,
        CONSTRAINT FK_PasswordResetTokens_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PasswordResetTokens_TokenHash')
BEGIN
    CREATE INDEX IX_PasswordResetTokens_TokenHash ON dbo.PasswordResetTokens (TokenHash);
END;
GO
