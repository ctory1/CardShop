/*
 * CardShop
 * Copyright © 2026 Colin Toryfter
 * All Rights Reserved.
 *
 * Unauthorized copying or distribution of this file is prohibited.
 */

using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using CardShop.Api;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.SqlClient;
using System.Net;
using System.Net.Mail;

var builder = WebApplication.CreateBuilder(args);

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins")
    .GetChildren()
    .Select(origin => origin.Value)
    .Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Cast<string>()
    .ToArray();

if (allowedOrigins.Length == 0)
{
    allowedOrigins = [
        "http://localhost:8000",
        "http://127.0.0.1:5500", 
        "https://ctory1.github.io"
    ];
}

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod());
});

builder.Services.AddSingleton<PasswordHasher<AppUser>>();
builder.Services.AddSingleton<Database>();
builder.Services.AddSingleton<EmailSender>();
builder.Services.AddHttpContextAccessor();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}
app.UseCors();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapPost("/api/auth/signup", async (
    SignupRequest request,
    Database db,
    PasswordHasher<AppUser> passwordHasher) =>
{
    var validation = ValidateSignup(request);
    if (validation is not null)
    {
        return validation;
    }

    var trimmedUsername = request.Username.Trim();
    var trimmedEmail = request.Email.Trim().ToLowerInvariant();

    // Check username and email separately so the user knows which field is taken
    var usernameExists = await db.UsernameExistsAsync(trimmedUsername);
    var emailExists = await db.EmailExistsAsync(trimmedEmail);

    if (usernameExists || emailExists)
    {
        var errors = new List<string>();
        var duplicateFields = new List<string>();
        if (usernameExists)
        {
            errors.Add("Username is taken");
            duplicateFields.Add("username");
        }
        if (emailExists)
        {
            errors.Add("Email is taken");
            duplicateFields.Add("email");
        }
        return Results.Conflict(new { message = string.Join(" and ", errors) + ".", duplicateFields });
    }

    var user = new AppUser
    {
        Username = trimmedUsername,
        Email = trimmedEmail,
        PasswordHash = string.Empty
    };
    user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

    var createdUser = await db.CreateUserAsync(user);
    var token = CreateToken();
    await db.CreateSessionAsync(createdUser.Id, HashToken(token));

    return Results.Ok(AuthResponse.FromUser(createdUser, token));
});

app.MapPost("/api/auth/login", async (
    LoginRequest request,
    Database db,
    PasswordHasher<AppUser> passwordHasher) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
    {
        return Results.BadRequest(new { message = "Email and password are required." });
    }

    var user = await db.GetUserByEmailAsync(request.Email.Trim().ToLowerInvariant());
    if (user is null)
    {
        return Results.NotFound(new { message = "Email not registered." });
    }

    var result = passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
    if (result == PasswordVerificationResult.Failed)
    {
        return Results.Json(new { message = "Password is incorrect." }, statusCode: StatusCodes.Status401Unauthorized);
    }

    var token = CreateToken();
    await db.CreateSessionAsync(user.Id, HashToken(token));

    return Results.Ok(AuthResponse.FromUser(user, token));
});

app.MapPost("/api/auth/request-password-reset", async (
    PasswordResetRequest request,
    HttpRequest httpRequest,
    Database db,
    EmailSender emailSender) =>
{
    if (!IsValidEmail(request.Email))
    {
        return Results.BadRequest(new { message = "Enter a valid email address." });
    }

    if (!emailSender.IsConfigured)
    {
        return Results.Json(
            new { message = "Password reset email is not configured on the server." },
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var email = request.Email.Trim().ToLowerInvariant();
    var user = await db.GetUserByEmailAsync(email);
    if (user is null)
    {
        return Results.NotFound(new { message = "Email not registered." });
    }

    var resetToken = CreateToken();
    try
    {
        await db.CreatePasswordResetTokenAsync(user.Id, HashToken(resetToken));
    }
    catch (SqlException)
    {
        return Results.Json(
            new { message = "Password reset storage is not ready. Run api/sql/003-password-reset-tokens.sql, then try again." },
            statusCode: StatusCodes.Status500InternalServerError);
    }

    var resetUrlBase = !string.IsNullOrWhiteSpace(request.ResetUrlBase)
        ? request.ResetUrlBase.Trim()
        : $"{httpRequest.Scheme}://{httpRequest.Host}/";
    var resetUrl = $"{resetUrlBase}{(resetUrlBase.Contains('?') ? "&" : "?")}resetToken={Uri.EscapeDataString(resetToken)}&email={Uri.EscapeDataString(email)}";

    try
    {
        await emailSender.SendPasswordResetAsync(email, user.Username, resetUrl);
    }
    catch (Exception)
    {
        return Results.Json(
            new { message = "Password reset email could not be sent right now." },
            statusCode: StatusCodes.Status500InternalServerError);
    }

    return Results.Ok(new { message = "Password reset email sent." });
});

app.MapPost("/api/auth/reset-password", async (
    PasswordResetConfirmRequest request,
    Database db,
    PasswordHasher<AppUser> passwordHasher) =>
{
    if (!IsValidEmail(request.Email))
    {
        return Results.BadRequest(new { message = "Enter a valid email address." });
    }

    if (string.IsNullOrWhiteSpace(request.Token))
    {
        return Results.BadRequest(new { message = "Reset token is required." });
    }

    if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
    {
        return Results.BadRequest(new { message = "Password must be at least 8 characters." });
    }

    var email = request.Email.Trim().ToLowerInvariant();
    var user = await db.GetUserByValidPasswordResetTokenAsync(email, HashToken(request.Token));
    if (user is null)
    {
        return Results.BadRequest(new { message = "This reset link is invalid or expired." });
    }

    user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
    await db.UpdatePasswordAsync(user.Id, user.PasswordHash);
    await db.MarkPasswordResetTokenUsedAsync(HashToken(request.Token));
    await db.DeleteSessionsForUserAsync(user.Id);

    return Results.Ok(new { message = "Password updated. You can log in now." });
});

app.MapPost("/api/auth/logout", async (HttpRequest request, Database db) =>
{
    var token = GetBearerToken(request);
    if (token is not null)
    {
        await db.DeleteSessionAsync(HashToken(token));
    }

    return Results.NoContent();
});

app.MapGet("/api/me", async (HttpRequest request, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    return user is null
        ? Results.Unauthorized()
        : Results.Ok(UserDto.FromUser(user));
});

app.MapGet("/api/cards", async (HttpRequest request, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    return Results.Ok(await db.GetCardsAsync(user.Id));
});

app.MapPost("/api/cards", async (HttpRequest request, SaveCardRequest card, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    if (string.IsNullOrWhiteSpace(card.CardName))
    {
        return Results.BadRequest(new { message = "CardName is required." });
    }

    var savedCard = await db.SaveCardAsync(user.Id, card);
    return Results.Ok(savedCard);
});

app.MapPut("/api/cards/{id:int}/price", async (HttpRequest request, int id, UpdateCardPriceRequest price, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    var savedCard = await db.UpdateCardPriceAsync(user.Id, id, price);
    return savedCard is null
        ? Results.NotFound(new { message = "Saved card not found." })
        : Results.Ok(savedCard);
});

app.MapDelete("/api/cards/{id:int}", async (HttpRequest request, int id, Database db) =>
{
    var user = await GetAuthenticatedUser(request, db);
    if (user is null)
    {
        return Results.Unauthorized();
    }

    await db.DeleteCardAsync(user.Id, id);
    return Results.NoContent();
});

app.Run();

static IResult? ValidateSignup(SignupRequest request)
{
    if (string.IsNullOrWhiteSpace(request.Username) || request.Username.Trim().Length < 3)
    {
        return Results.BadRequest(new { message = "Username must be at least 3 characters." });
    }

    if (!IsValidEmail(request.Email))
    {
        return Results.BadRequest(new { message = "Email is not valid." });
    }

    if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
    {
        return Results.BadRequest(new { message = "Password must be at least 8 characters." });
    }

    return null;
}

static bool IsValidEmail(string email)
{
    return !string.IsNullOrWhiteSpace(email)
        && Regex.IsMatch(email, @"^[^\s@]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}$", RegexOptions.IgnoreCase);
}

static string CreateToken()
{
    return Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
}

static string HashToken(string token)
{
    return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

static string? GetBearerToken(HttpRequest request)
{
    var authorization = request.Headers.Authorization.ToString();
    return authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
        ? authorization["Bearer ".Length..].Trim()
        : null;
}

static async Task<AppUser?> GetAuthenticatedUser(HttpRequest request, Database db)
{
    var token = GetBearerToken(request);
    if (string.IsNullOrWhiteSpace(token))
    {
        return null;
    }

    return await db.GetUserBySessionAsync(HashToken(token));
}

namespace CardShop.Api
{
    public sealed class AppUser
    {
        public int Id { get; set; }
        public required string Username { get; set; }
        public required string Email { get; set; }
        public required string PasswordHash { get; set; }
    }

    public sealed record SignupRequest(string Username, string Email, string Password);
    public sealed record LoginRequest(string Email, string Password);
    public sealed record PasswordResetRequest(string Email, string? ResetUrlBase);
    public sealed record PasswordResetConfirmRequest(string Email, string Token, string Password);
    public sealed record UserDto(int Id, string Username, string Email)
    {
        public static UserDto FromUser(AppUser user) => new(user.Id, user.Username, user.Email);
    }

    public sealed record AuthResponse(string Token, UserDto User)
    {
        public static AuthResponse FromUser(AppUser user, string token) => new(token, UserDto.FromUser(user));
    }

    public sealed record SaveCardRequest(
        string? CardApiId,
        string CardName,
        string? CardSet,
        string? CardNumber,
        string? ImageUrl,
        decimal? MarketPrice,
        decimal? ShopPrice);

    public sealed record UpdateCardPriceRequest(decimal? MarketPrice, decimal? ShopPrice);

    public sealed record SavedCardResponse(
        int Id,
        string? CardApiId,
        string CardName,
        string? CardSet,
        string? CardNumber,
        string? ImageUrl,
        decimal? MarketPrice,
        decimal? ShopPrice,
        DateTime CreatedAt);

    public sealed class Database(IConfiguration configuration)
    {
        private readonly string _connectionString = configuration.GetConnectionString("CardShop")
            ?? throw new InvalidOperationException("Missing ConnectionStrings:CardShop.");

        public async Task<bool> UsernameExistsAsync(string username)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT COUNT(1)
                FROM Users
                WHERE LOWER(Username) = LOWER(@Username);
                """, connection);
            command.Parameters.AddWithValue("@Username", username);
            return Convert.ToInt32(await command.ExecuteScalarAsync()) > 0;
        }

        public async Task<bool> EmailExistsAsync(string email)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT COUNT(1)
                FROM Users
                WHERE LOWER(Email) = LOWER(@Email);
                """, connection);
            command.Parameters.AddWithValue("@Email", email);
            return Convert.ToInt32(await command.ExecuteScalarAsync()) > 0;
        }

        public async Task<bool> UserExistsAsync(string username, string email)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT COUNT(1)
                FROM Users
                WHERE LOWER(Username) = LOWER(@Username)
                   OR LOWER(Email) = LOWER(@Email);
                """, connection);
            command.Parameters.AddWithValue("@Username", username.Trim());
            command.Parameters.AddWithValue("@Email", email.Trim());
            return Convert.ToInt32(await command.ExecuteScalarAsync()) > 0;
        }

        public async Task<AppUser> CreateUserAsync(AppUser user)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                INSERT INTO Users (Username, Email, PasswordHash)
                OUTPUT INSERTED.Id
                VALUES (@Username, @Email, @PasswordHash);
                """, connection);
            command.Parameters.AddWithValue("@Username", user.Username);
            command.Parameters.AddWithValue("@Email", user.Email);
            command.Parameters.AddWithValue("@PasswordHash", user.PasswordHash);
            user.Id = Convert.ToInt32(await command.ExecuteScalarAsync());
            return user;
        }

        public async Task<AppUser?> GetUserByEmailAsync(string email)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT TOP 1 Id, Username, Email, PasswordHash
                FROM Users
                WHERE LOWER(Email) = LOWER(@Email);
                """, connection);
            command.Parameters.AddWithValue("@Email", email);
            await using var reader = await command.ExecuteReaderAsync();
            return await reader.ReadAsync() ? ReadUser(reader) : null;
        }

        public async Task CreateSessionAsync(int userId, string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                INSERT INTO UserSessions (UserId, TokenHash, ExpiresAt)
                VALUES (@UserId, @TokenHash, DATEADD(day, 30, SYSUTCDATETIME()));
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task DeleteSessionAsync(string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("DELETE FROM UserSessions WHERE TokenHash = @TokenHash;", connection);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task DeleteSessionsForUserAsync(int userId)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("DELETE FROM UserSessions WHERE UserId = @UserId;", connection);
            command.Parameters.AddWithValue("@UserId", userId);
            await command.ExecuteNonQueryAsync();
        }

        public async Task<AppUser?> GetUserBySessionAsync(string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                DELETE FROM UserSessions WHERE ExpiresAt <= SYSUTCDATETIME();

                SELECT TOP 1 u.Id, u.Username, u.Email, u.PasswordHash
                FROM UserSessions s
                JOIN Users u ON u.Id = s.UserId
                WHERE s.TokenHash = @TokenHash;
                """, connection);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await using var reader = await command.ExecuteReaderAsync();
            return await reader.ReadAsync() ? ReadUser(reader) : null;
        }

        public async Task CreatePasswordResetTokenAsync(int userId, string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                DELETE FROM PasswordResetTokens
                WHERE UserId = @UserId AND (UsedAt IS NULL OR ExpiresAt <= SYSUTCDATETIME());

                INSERT INTO PasswordResetTokens (UserId, TokenHash, ExpiresAt)
                VALUES (@UserId, @TokenHash, DATEADD(hour, 1, SYSUTCDATETIME()));
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task<AppUser?> GetUserByValidPasswordResetTokenAsync(string email, string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                DELETE FROM PasswordResetTokens WHERE ExpiresAt <= SYSUTCDATETIME();

                SELECT TOP 1 u.Id, u.Username, u.Email, u.PasswordHash
                FROM PasswordResetTokens t
                JOIN Users u ON u.Id = t.UserId
                WHERE LOWER(u.Email) = LOWER(@Email)
                  AND t.TokenHash = @TokenHash
                  AND t.UsedAt IS NULL
                  AND t.ExpiresAt > SYSUTCDATETIME();
                """, connection);
            command.Parameters.AddWithValue("@Email", email);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await using var reader = await command.ExecuteReaderAsync();
            return await reader.ReadAsync() ? ReadUser(reader) : null;
        }

        public async Task MarkPasswordResetTokenUsedAsync(string tokenHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                UPDATE PasswordResetTokens
                SET UsedAt = SYSUTCDATETIME()
                WHERE TokenHash = @TokenHash;
                """, connection);
            command.Parameters.AddWithValue("@TokenHash", tokenHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task UpdatePasswordAsync(int userId, string passwordHash)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                UPDATE Users
                SET PasswordHash = @PasswordHash
                WHERE Id = @UserId;
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@PasswordHash", passwordHash);
            await command.ExecuteNonQueryAsync();
        }

        public async Task<IReadOnlyList<SavedCardResponse>> GetCardsAsync(int userId)
        {
            var cards = new List<SavedCardResponse>();
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                SELECT Id, CardApiId, CardName, CardSet, CardNumber, ImageUrl, MarketPrice, ShopPrice, CreatedAt
                FROM ScannedCards
                WHERE UserId = @UserId
                ORDER BY CreatedAt DESC;
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                cards.Add(ReadCard(reader));
            }
            return cards;
        }

        public async Task<SavedCardResponse> SaveCardAsync(int userId, SaveCardRequest card)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                INSERT INTO ScannedCards (UserId, CardApiId, CardName, CardSet, CardNumber, ImageUrl, MarketPrice, ShopPrice)
                OUTPUT INSERTED.Id, INSERTED.CardApiId, INSERTED.CardName, INSERTED.CardSet, INSERTED.CardNumber,
                       INSERTED.ImageUrl, INSERTED.MarketPrice, INSERTED.ShopPrice, INSERTED.CreatedAt
                VALUES (@UserId, @CardApiId, @CardName, @CardSet, @CardNumber, @ImageUrl, @MarketPrice, @ShopPrice);
                """, connection);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@CardApiId", DbValue(card.CardApiId));
            command.Parameters.AddWithValue("@CardName", card.CardName);
            command.Parameters.AddWithValue("@CardSet", DbValue(card.CardSet));
            command.Parameters.AddWithValue("@CardNumber", DbValue(card.CardNumber));
            command.Parameters.AddWithValue("@ImageUrl", DbValue(card.ImageUrl));
            command.Parameters.AddWithValue("@MarketPrice", DbValue(card.MarketPrice));
            command.Parameters.AddWithValue("@ShopPrice", DbValue(card.ShopPrice));
            await using var reader = await command.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
            {
                throw new InvalidOperationException("Saved card insert did not return a row.");
            }
            return ReadCard(reader);
        }

        public async Task<SavedCardResponse?> UpdateCardPriceAsync(int userId, int id, UpdateCardPriceRequest price)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("""
                UPDATE ScannedCards
                SET MarketPrice = @MarketPrice,
                    ShopPrice = @ShopPrice
                OUTPUT INSERTED.Id, INSERTED.CardApiId, INSERTED.CardName, INSERTED.CardSet, INSERTED.CardNumber,
                       INSERTED.ImageUrl, INSERTED.MarketPrice, INSERTED.ShopPrice, INSERTED.CreatedAt
                WHERE Id = @Id AND UserId = @UserId;
                """, connection);
            command.Parameters.AddWithValue("@Id", id);
            command.Parameters.AddWithValue("@UserId", userId);
            command.Parameters.AddWithValue("@MarketPrice", DbValue(price.MarketPrice));
            command.Parameters.AddWithValue("@ShopPrice", DbValue(price.ShopPrice));
            await using var reader = await command.ExecuteReaderAsync();
            return await reader.ReadAsync() ? ReadCard(reader) : null;
        }

        public async Task DeleteCardAsync(int userId, int id)
        {
            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync();
            await using var command = new SqlCommand("DELETE FROM ScannedCards WHERE Id = @Id AND UserId = @UserId;", connection);
            command.Parameters.AddWithValue("@Id", id);
            command.Parameters.AddWithValue("@UserId", userId);
            await command.ExecuteNonQueryAsync();
        }

        private static AppUser ReadUser(SqlDataReader reader) => new()
        {
            Id = reader.GetInt32(0),
            Username = reader.GetString(1),
            Email = reader.GetString(2),
            PasswordHash = reader.GetString(3)
        };

        private static SavedCardResponse ReadCard(SqlDataReader reader) => new(
            reader.GetInt32(0),
            reader.IsDBNull(1) ? null : reader.GetString(1),
            reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4),
            reader.IsDBNull(5) ? null : reader.GetString(5),
            reader.IsDBNull(6) ? null : reader.GetDecimal(6),
            reader.IsDBNull(7) ? null : reader.GetDecimal(7),
            reader.GetDateTime(8));

        private static object DbValue(object? value) => value is null ? DBNull.Value : value;
    }

    public sealed class EmailSender(IConfiguration configuration)
    {
        private readonly IConfigurationSection _emailConfig = configuration.GetSection("Email");

        public bool IsConfigured =>
            !string.IsNullOrWhiteSpace(_emailConfig["SmtpHost"])
            && !string.IsNullOrWhiteSpace(_emailConfig["FromAddress"]);

        public async Task SendPasswordResetAsync(string toEmail, string username, string resetUrl)
        {
            var host = _emailConfig["SmtpHost"];
            var fromAddress = _emailConfig["FromAddress"];
            if (string.IsNullOrWhiteSpace(host) || string.IsNullOrWhiteSpace(fromAddress))
            {
                throw new InvalidOperationException("Email:SmtpHost and Email:FromAddress are required.");
            }

            var port = int.TryParse(_emailConfig["SmtpPort"], out var configuredPort) ? configuredPort : 587;
            var enableSsl = !bool.TryParse(_emailConfig["EnableSsl"], out var configuredSsl) || configuredSsl;
            var fromName = string.IsNullOrWhiteSpace(_emailConfig["FromName"]) ? "J&C PokePawns" : _emailConfig["FromName"];

            using var message = new MailMessage
            {
                From = new MailAddress(fromAddress, fromName),
                Subject = "Reset your J&C PokePawns password",
                Body = $"""
                    Hi {username},

                    Click the link below to reset your password. This link expires in 1 hour.

                    {resetUrl}

                    If you did not ask to reset your password, you can ignore this email.
                    """,
                IsBodyHtml = false
            };
            message.To.Add(toEmail);

            using var client = new SmtpClient(host, port)
            {
                EnableSsl = enableSsl
            };

            var smtpUser = _emailConfig["SmtpUser"];
            var smtpPassword = _emailConfig["SmtpPassword"];
            if (!string.IsNullOrWhiteSpace(smtpUser) && !string.IsNullOrWhiteSpace(smtpPassword))
            {
                client.Credentials = new NetworkCredential(smtpUser, smtpPassword);
            }

            await client.SendMailAsync(message);
        }
    }
}
