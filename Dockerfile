# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0-preview AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY ["StudentManagement.csproj", "./"]
RUN dotnet restore "StudentManagement.csproj"

# Copy remaining source code and publish
COPY . .
RUN dotnet publish "StudentManagement.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0-preview AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Environment variables
ENV ASPNETCORE_URLS=http://+:5078
ENV ASPNETCORE_ENVIRONMENT=Production

EXPOSE 5078

ENTRYPOINT ["dotnet", "StudentManagement.dll"]
