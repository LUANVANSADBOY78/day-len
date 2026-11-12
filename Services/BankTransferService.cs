using StudentManagement.DTOs;

namespace StudentManagement.Services;

public class BankTransferService
{
    private readonly IConfiguration configuration;

    public BankTransferService(IConfiguration configuration)
    {
        this.configuration = configuration;
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(configuration["BankTransfer:AccountNumber"]) &&
        !string.IsNullOrWhiteSpace(configuration["BankTransfer:AccountName"]);

    public BankTransferInstructionsDto? CreateInstructions(decimal amount, string transferDescription)
    {
        if (!IsConfigured) return null;

        return new BankTransferInstructionsDto
        {
            BankName = configuration["BankTransfer:BankName"] ?? "BIDV",
            AccountNumber = configuration["BankTransfer:AccountNumber"]!,
            AccountName = configuration["BankTransfer:AccountName"]!,
            Amount = amount,
            TransferDescription = transferDescription
        };
    }
}
