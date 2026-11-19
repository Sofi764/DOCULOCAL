using MySql.Data.MySqlClient;

namespace DocuLocal.Backend.Data;

public class DbHelper
{
    private readonly string _connectionString;

    public DbHelper(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DocuLocalConnection")
            ?? throw new InvalidOperationException("No se encontró la cadena de conexión 'DocuLocalConnection'.");
    }

    public MySqlConnection CrearConexion()
    {
        return new MySqlConnection(_connectionString);
    }
}