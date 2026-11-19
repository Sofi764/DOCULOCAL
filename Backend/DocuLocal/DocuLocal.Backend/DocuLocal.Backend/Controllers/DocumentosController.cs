using DocuLocal.Backend.Data;
using DocuLocal.Backend.Models;
using Microsoft.AspNetCore.Mvc;
using MySql.Data.MySqlClient;
using System.Data;

namespace DocuLocal.Backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DocumentosController : ControllerBase
{
    private readonly DbHelper _dbHelper;
    private readonly string _carpetaLocal;

    public DocumentosController(DbHelper dbHelper, IConfiguration configuration)
    {
        _dbHelper = dbHelper;
        _carpetaLocal = configuration["StorageSettings:CarpetaArchivosLocales"]
            ?? @"C:\Proyectos\DocuLocal\ArchivosLocales";
        Directory.CreateDirectory(_carpetaLocal);
    }

    public class DocumentoFormRequest
    {
        public int IdUsuario { get; set; }
        public string NombreDocumento { get; set; } = string.Empty;
        public string CategoriaDocumento { get; set; } = string.Empty;
        public string? Descripcion { get; set; }
        public DateTime FechaDocumento { get; set; }
        public string TipoSoporte { get; set; } = string.Empty;
        public string? UbicacionFisica { get; set; }
        public IFormFile? ArchivoDigital { get; set; }
    }

    [HttpGet]
    public async Task<IActionResult> Listar(
        [FromQuery] int idUsuario,
        [FromQuery] string? buscar = null,
        [FromQuery] string? categoria = null,
        [FromQuery] string? tipoSoporte = null)
    {
        if (idUsuario <= 0)
            return BadRequest(new { mensaje = "El idUsuario es obligatorio para filtrar los documentos." });

        var documentos = new List<Documento>();

        await using var conexion = _dbHelper.CrearConexion();
        await conexion.OpenAsync();

        var sql = @"
            SELECT IdDocumento, IdUsuario, NombreDocumento, CategoriaDocumento,
                   Descripcion, FechaDocumento, TipoSoporte, UbicacionFisica, RutaArchivoDigital
            FROM Documento
            WHERE IdUsuario = @IdUsuario";

        if (!string.IsNullOrWhiteSpace(categoria))
            sql += " AND LOWER(CategoriaDocumento) = LOWER(@Categoria)";

        if (!string.IsNullOrWhiteSpace(tipoSoporte))
            sql += " AND LOWER(TipoSoporte) = LOWER(@TipoSoporte)";

        if (!string.IsNullOrWhiteSpace(buscar))
            sql += @" AND (LOWER(NombreDocumento) LIKE LOWER(@Buscar)
                        OR LOWER(IFNULL(Descripcion, '')) LIKE LOWER(@Buscar)
                        OR LOWER(IFNULL(UbicacionFisica, '')) LIKE LOWER(@Buscar))";

        sql += " ORDER BY FechaDocumento DESC, IdDocumento DESC;";

        await using var cmd = new MySqlCommand(sql, conexion);
        cmd.Parameters.AddWithValue("@IdUsuario", idUsuario);

        if (!string.IsNullOrWhiteSpace(categoria))
            cmd.Parameters.AddWithValue("@Categoria", categoria.Trim());

        if (!string.IsNullOrWhiteSpace(tipoSoporte))
            cmd.Parameters.AddWithValue("@TipoSoporte", tipoSoporte.Trim());

        if (!string.IsNullOrWhiteSpace(buscar))
            cmd.Parameters.AddWithValue("@Buscar", $"%{buscar.Trim()}%");

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            documentos.Add(new Documento
            {
                IdDocumento = reader.GetInt32("IdDocumento"),
                IdUsuario = reader.GetInt32("IdUsuario"),
                NombreDocumento = reader.GetString("NombreDocumento"),
                CategoriaDocumento = reader.GetString("CategoriaDocumento"),
                Descripcion = reader.IsDBNull(reader.GetOrdinal("Descripcion")) ? null : reader.GetString("Descripcion"),
                FechaDocumento = reader.GetDateTime("FechaDocumento"),
                TipoSoporte = reader.GetString("TipoSoporte"),
                UbicacionFisica = reader.IsDBNull(reader.GetOrdinal("UbicacionFisica")) ? null : reader.GetString("UbicacionFisica"),
                RutaArchivoDigital = reader.IsDBNull(reader.GetOrdinal("RutaArchivoDigital")) ? null : reader.GetString("RutaArchivoDigital")
            });
        }

        return Ok(documentos);
    }

    [HttpPost]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Crear([FromForm] DocumentoFormRequest request)
    {
        if (request.IdUsuario <= 0 ||
            string.IsNullOrWhiteSpace(request.NombreDocumento) ||
            string.IsNullOrWhiteSpace(request.CategoriaDocumento) ||
            string.IsNullOrWhiteSpace(request.TipoSoporte))
        {
            return BadRequest(new { mensaje = "Faltan campos obligatorios (IdUsuario, NombreDocumento, CategoriaDocumento, TipoSoporte)." });
        }

        string? rutaGuardada = null;
        if (request.ArchivoDigital is not null && request.ArchivoDigital.Length > 0)
        {
            string carpetaUsuario = Path.Combine(_carpetaLocal, $"usuario_{request.IdUsuario}");
            Directory.CreateDirectory(carpetaUsuario);

            string nombreSeguro = $"{Guid.NewGuid()}_{Path.GetFileName(request.ArchivoDigital.FileName)}";
            string rutaCompleta = Path.Combine(carpetaUsuario, nombreSeguro);

            await using var stream = new FileStream(rutaCompleta, FileMode.Create);
            await request.ArchivoDigital.CopyToAsync(stream);

            rutaGuardada = rutaCompleta;
        }

        await using var conexion = _dbHelper.CrearConexion();
        await conexion.OpenAsync();

        const string sqlInsertar = @"
            INSERT INTO Documento (
                IdUsuario, NombreDocumento, CategoriaDocumento, Descripcion,
                FechaDocumento, TipoSoporte, UbicacionFisica, RutaArchivoDigital
            )
            VALUES (
                @IdUsuario, @NombreDocumento, @CategoriaDocumento, @Descripcion,
                @FechaDocumento, @TipoSoporte, @UbicacionFisica, @RutaArchivoDigital
            );
            SELECT LAST_INSERT_ID();";

        await using var cmd = new MySqlCommand(sqlInsertar, conexion);
        cmd.Parameters.AddWithValue("@IdUsuario", request.IdUsuario);
        cmd.Parameters.AddWithValue("@NombreDocumento", request.NombreDocumento.Trim());
        cmd.Parameters.AddWithValue("@CategoriaDocumento", request.CategoriaDocumento.Trim());
        cmd.Parameters.AddWithValue("@Descripcion", string.IsNullOrWhiteSpace(request.Descripcion) ? DBNull.Value : request.Descripcion.Trim());
        cmd.Parameters.AddWithValue("@FechaDocumento", request.FechaDocumento == default ? DateTime.Today : request.FechaDocumento);
        cmd.Parameters.AddWithValue("@TipoSoporte", request.TipoSoporte.Trim());
        cmd.Parameters.AddWithValue("@UbicacionFisica", string.IsNullOrWhiteSpace(request.UbicacionFisica) ? DBNull.Value : request.UbicacionFisica.Trim());
        cmd.Parameters.AddWithValue("@RutaArchivoDigital", (object?)rutaGuardada ?? DBNull.Value);

        var idGenerado = Convert.ToInt32(await cmd.ExecuteScalarAsync());

        return Ok(new
        {
            mensaje = "Documento registrado correctamente.",
            idDocumento = idGenerado,
            rutaArchivoDigital = rutaGuardada
        });
    }

    [HttpPut("{idDocumento:int}")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> Editar(int idDocumento, [FromForm] DocumentoFormRequest request)
    {
        if (request.IdUsuario <= 0)
            return BadRequest(new { mensaje = "El idUsuario es obligatorio." });

        await using var conexion = _dbHelper.CrearConexion();
        await conexion.OpenAsync();

        string? rutaActual = null;
        const string sqlConsultar = @"
            SELECT RutaArchivoDigital
            FROM Documento
            WHERE IdDocumento = @IdDocumento AND IdUsuario = @IdUsuario
            LIMIT 1;";

        await using (var cmdConsulta = new MySqlCommand(sqlConsultar, conexion))
        {
            cmdConsulta.Parameters.AddWithValue("@IdDocumento", idDocumento);
            cmdConsulta.Parameters.AddWithValue("@IdUsuario", request.IdUsuario);

            await using var reader = await cmdConsulta.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return NotFound(new { mensaje = "Documento no encontrado para este usuario." });

            rutaActual = reader.IsDBNull(0) ? null : reader.GetString(0);
        }

        string? nuevaRuta = rutaActual;
        if (request.ArchivoDigital is not null && request.ArchivoDigital.Length > 0)
        {
            string carpetaUsuario = Path.Combine(_carpetaLocal, $"usuario_{request.IdUsuario}");
            Directory.CreateDirectory(carpetaUsuario);

            string nombreSeguro = $"{Guid.NewGuid()}_{Path.GetFileName(request.ArchivoDigital.FileName)}";
            string rutaCompleta = Path.Combine(carpetaUsuario, nombreSeguro);

            await using var stream = new FileStream(rutaCompleta, FileMode.Create);
            await request.ArchivoDigital.CopyToAsync(stream);

            if (!string.IsNullOrWhiteSpace(rutaActual) && System.IO.File.Exists(rutaActual))
                System.IO.File.Delete(rutaActual);

            nuevaRuta = rutaCompleta;
        }

        const string sqlActualizar = @"
            UPDATE Documento
            SET NombreDocumento = @NombreDocumento,
                CategoriaDocumento = @CategoriaDocumento,
                Descripcion = @Descripcion,
                FechaDocumento = @FechaDocumento,
                TipoSoporte = @TipoSoporte,
                UbicacionFisica = @UbicacionFisica,
                RutaArchivoDigital = @RutaArchivoDigital
            WHERE IdDocumento = @IdDocumento AND IdUsuario = @IdUsuario;";

        await using var cmdUpdate = new MySqlCommand(sqlActualizar, conexion);
        cmdUpdate.Parameters.AddWithValue("@IdDocumento", idDocumento);
        cmdUpdate.Parameters.AddWithValue("@IdUsuario", request.IdUsuario);
        cmdUpdate.Parameters.AddWithValue("@NombreDocumento", request.NombreDocumento.Trim());
        cmdUpdate.Parameters.AddWithValue("@CategoriaDocumento", request.CategoriaDocumento.Trim());
        cmdUpdate.Parameters.AddWithValue("@Descripcion", string.IsNullOrWhiteSpace(request.Descripcion) ? DBNull.Value : request.Descripcion.Trim());
        cmdUpdate.Parameters.AddWithValue("@FechaDocumento", request.FechaDocumento == default ? DateTime.Today : request.FechaDocumento);
        cmdUpdate.Parameters.AddWithValue("@TipoSoporte", request.TipoSoporte.Trim());
        cmdUpdate.Parameters.AddWithValue("@UbicacionFisica", string.IsNullOrWhiteSpace(request.UbicacionFisica) ? DBNull.Value : request.UbicacionFisica.Trim());
        cmdUpdate.Parameters.AddWithValue("@RutaArchivoDigital", (object?)nuevaRuta ?? DBNull.Value);

        await cmdUpdate.ExecuteNonQueryAsync();

        return Ok(new
        {
            mensaje = "Documento actualizado correctamente.",
            rutaArchivoDigital = nuevaRuta
        });
    }

    [HttpDelete("{idDocumento:int}")]
    public async Task<IActionResult> Eliminar(int idDocumento, [FromQuery] int idUsuario)
    {
        if (idUsuario <= 0)
            return BadRequest(new { mensaje = "El idUsuario es obligatorio." });

        await using var conexion = _dbHelper.CrearConexion();
        await conexion.OpenAsync();

        string? rutaArchivo = null;
        const string sqlBuscar = @"
            SELECT RutaArchivoDigital
            FROM Documento
            WHERE IdDocumento = @IdDocumento AND IdUsuario = @IdUsuario
            LIMIT 1;";

        await using (var cmdBuscar = new MySqlCommand(sqlBuscar, conexion))
        {
            cmdBuscar.Parameters.AddWithValue("@IdDocumento", idDocumento);
            cmdBuscar.Parameters.AddWithValue("@IdUsuario", idUsuario);

            await using var reader = await cmdBuscar.ExecuteReaderAsync();
            if (!await reader.ReadAsync())
                return NotFound(new { mensaje = "Documento no encontrado para este usuario." });

            rutaArchivo = reader.IsDBNull(0) ? null : reader.GetString(0);
        }

        const string sqlEliminar = "DELETE FROM Documento WHERE IdDocumento = @IdDocumento AND IdUsuario = @IdUsuario;";
        await using var cmdDelete = new MySqlCommand(sqlEliminar, conexion);
        cmdDelete.Parameters.AddWithValue("@IdDocumento", idDocumento);
        cmdDelete.Parameters.AddWithValue("@IdUsuario", idUsuario);
        await cmdDelete.ExecuteNonQueryAsync();

        if (!string.IsNullOrWhiteSpace(rutaArchivo) && System.IO.File.Exists(rutaArchivo))
            System.IO.File.Delete(rutaArchivo);

        return Ok(new { mensaje = "Documento eliminado correctamente." });
    }
}