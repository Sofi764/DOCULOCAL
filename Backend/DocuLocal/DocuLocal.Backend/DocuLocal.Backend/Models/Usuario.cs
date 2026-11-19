namespace DocuLocal.Backend.Models;

public class Usuario
{
    public int IdUsuario { get; set; }
    public string Correo { get; set; } = string.Empty;
    public string ContrasenaHash { get; set; } = string.Empty;
}