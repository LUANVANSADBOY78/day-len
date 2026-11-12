# Chuan ban chinh thuc .NET 10.0 (khop 100% voi StudentManagement.dll)
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# Copy ban da publish san
COPY ./publish .

# Environment variables
ENV ASPNETCORE_URLS=http://+:5078
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 5078

ENTRYPOINT ["dotnet", "StudentManagement.dll"]
