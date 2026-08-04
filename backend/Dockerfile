FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY src/GbcLims.Domain/GbcLims.Domain.csproj src/GbcLims.Domain/
COPY src/GbcLims.Application/GbcLims.Application.csproj src/GbcLims.Application/
COPY src/GbcLims.Infrastructure/GbcLims.Infrastructure.csproj src/GbcLims.Infrastructure/
COPY src/GbcLims.Api/GbcLims.Api.csproj src/GbcLims.Api/
RUN dotnet restore src/GbcLims.Api/GbcLims.Api.csproj

COPY src/ src/
RUN dotnet publish src/GbcLims.Api/GbcLims.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_ENVIRONMENT=Production

# Render (and most PaaS hosts) assign the port to listen on via $PORT at container
# start, not build time — Kestrel's bind address has to be resolved in the shell at
# runtime, which is why this is an ENTRYPOINT command rather than an ASPNETCORE_URLS
# ENV line (ENV values can't reference a variable that doesn't exist until the
# container actually starts).
ENTRYPOINT ["sh", "-c", "ASPNETCORE_URLS=http://+:${PORT:-8080} dotnet GbcLims.Api.dll"]
