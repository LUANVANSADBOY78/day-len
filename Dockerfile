# Runtime stage sieu nhe (khong can tai .NET SDK 2.5GB)
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS runtime
WORKDIR /app

# Copy ban da publish san
COPY ./publish .

# Environment variables
ENV ASPNETCORE_URLS=http://+:5078
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 5078

ENTRYPOINT ["dotnet", "StudentManagement.dll"]
