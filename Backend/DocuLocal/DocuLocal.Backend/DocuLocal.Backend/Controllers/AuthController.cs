using DocuLocal.Backend.Data;
using DocuLocal.Backend.Models;
using Microsoft.AspNetCore.Mvc;
using MySql.Data.MySqlClient;
using System.Data;
using System.Security.Cryptography;

namespace DocuLocal.Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly DbHelper _dbHelper;

    public AuthController(DbHelper dbHelper)
    {
        _dbHelper = dbHelper;
    }

    public record RegistroRequest(string Correo, string Contrasena);
    public record LoginRequest(string Correo, string Contrasena);

    [HttpPost("registro")]
    public async Task<IActionResult> Registrar([FromBody] RegistroRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Correo) || string.IsNullOrWhiteSpace(request.Contrasena))
            return BadRequest(new { mensaje = "El correo y la contraseña son obligatorios." });

        string correoNormalizado = request.Correo.Trim().ToLowerInvariant();
        string hashGuardado = HashPassword(request.Contrasena);

        await using var conexion = _dbHelper.CrearConexion();
        await conexion.OpenAsync();

        const string sqlVerificar = "SELECT COUNT(1) FROM Usuario WHERE Correo = @Correo;";
        await using (var cmdVerificar = new MySqlCommand(sqlVerificar, conexion))
        {
            cmdVerificar.Parameters.AddWithValue("@Correo", correoNormalizado);
            var existe = Convert.ToInt64(await cmdVerificar.ExecuteScalarAsync());
            if (existe > 0)
                return Conflict(new { mensaje = "Ya existe un usuario registrado con ese correo." });
        }

        const string sqlInsertar = @"
            INSERT INTO Usuario (Correo, ContrasenaHash)
            VALUES (@Correo, @ContrasenaHash);
            SELECT LAST_INSERT_ID();";

        await using var cmdInsertar = new MySqlCommand(sqlInsertar, conexion);
        cmdInsertar.Parameters.AddWithValue("@Correo", correoNormalizado);
        cmdInsertar.Parameters.AddWithValue("@ContrasenaHash", hashGuardado);

        var idGenerado = Convert.ToInt32(await cmdInsertar.ExecuteScalarAsync());

        return Ok(new
        {
            mensaje = "Usuario registrado correctamente.",
            idUsuario = idGenerado,
            correo = correoNormalizado
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Correo) || string.IsNullOrWhiteSpace(request.Contrasena))
            return BadRequest(new { mensaje = "Debes ingresar correo y contraseña." });

        string correoNormalizado = request.Correo.Trim().ToLowerInvariant();

        await using var conexion = _dbHelper.CrearConexion();
        await conexion.OpenAsync();

        const string sqlBuscar = @"
            SELECT IdUsuario, Correo, ContrasenaHash
            FROM Usuario
            WHERE Correo = @Correo
            LIMIT 1;";

        await using var cmd = new MySqlCommand(sqlBuscar, conexion);
        cmd.Parameters.AddWithValue("@Correo", correoNormalizado);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (!await reader.ReadAsync())
            return Unauthorized(new { mensaje = "Credenciales inválidas." });

        var usuario = new Usuario
        {
            IdUsuario = reader.GetInt32("IdUsuario"),
            Correo = reader.GetString("Correo"),
            ContrasenaHash = reader.GetString("ContrasenaHash")
        };

        if (!VerificarPassword(request.Contrasena, usuario.ContrasenaHash))
            return Unauthorized(new { mensaje = "Credenciales inválidas." });

        return Ok(new
        {
            mensaje = "Inicio de sesión exitoso.",
            idUsuario = usuario.IdUsuario,
            correo = usuario.Correo
        });
    }

    private static string HashPassword(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(16);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            100_000,
            HashAlgorithmName.SHA256,
            32);

        return $"{Convert.ToBase64String(salt)}:{Convert.ToBase64String(hash)}";
    }

    private static bool VerificarPassword(string password, string almacenado)
    {
        var partes = almacenado.Split(':');
        if (partes.Length != 2) return false;

        byte[] salt = Convert.FromBase64String(partes[0]);
        byte[] hashEsperado = Convert.FromBase64String(partes[1]);
        byte[] hashCalculado = Rfc2898DeriveBytes.Pbkdf2(
            password,
            salt,
            100_000,
            HashAlgorithmName.SHA256,
            hashEsperado.Length);

        return CryptographicOperations.FixedTimeEquals(hashCalculado, hashEsperado);
    }
}