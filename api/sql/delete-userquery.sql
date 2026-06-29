/*
 * CardShop
 * Copyright © 2026 Colin Toryfter
 * All Rights Reserved.
 *
 * Unauthorized copying or distribution of this file is prohibited.
 */

DECLARE @Email NVARCHAR(255) = 'test@gmail.com';
DECLARE @UserId INT;

SELECT @UserId = Id
FROM dbo.Users
WHERE Email = @Email;

IF @UserId IS NOT NULL
BEGIN
    BEGIN TRANSACTION;

    DELETE FROM dbo.ScannedCards
    WHERE UserId = @UserId;

    DELETE FROM dbo.PasswordResetTokens
    WHERE UserId = @UserId;

    DELETE FROM dbo.UserSessions
    WHERE UserId = @UserId;

    DELETE FROM dbo.Users
    WHERE Id = @UserId;

    COMMIT TRANSACTION;
END;
