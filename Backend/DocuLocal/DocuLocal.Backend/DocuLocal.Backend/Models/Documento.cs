namespace DocuLocal.Backend.Models;

public class Documento
{
    public int IdDocumento { get; set; }
    public int IdUsuario { get; set; }
    public string NombreDocumento { get; set; } = string.Empty;
    public string CategoriaDocumento { get; set; } = string.Empty;
    public string? Descripcion { get; set; }
    public DateTime FechaDocumento { get; set; }
    public string TipoSoporte { get; set; } = string.Empty;
    public string? UbicacionFisica { get; set; }
    public string? RutaArchivoDigital { get; set; }
}