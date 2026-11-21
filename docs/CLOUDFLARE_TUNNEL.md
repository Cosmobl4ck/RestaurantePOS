# Cloudflare Tunnel

Configuración para publicar el POS en Contabo sin abrir puertos y conservar la IP real del cliente.

## Flujo

```
Tablet / PC
   -> HTTPS
   -> Cloudflare (DNS, TLS, WAF)
   -> Cloudflare Tunnel
   -> cloudflared en Contabo
   -> Express en 127.0.0.1:3010
```

El origen no debe escuchar en una IP pública. Express debe quedar en loopback y el firewall de Contabo debe bloquear el puerto 3010 desde Internet.

## Variables de entorno

```env
TRUST_PROXY=loopback
TRUST_CLOUDFLARE=true
ENFORCE_HTTPS=true
COOKIE_SECURE=true
```

- `TRUST_PROXY=loopback`: cloudflared conecta desde `127.0.0.1`.
- `TRUST_CLOUDFLARE=true`: autoriza `CF-Connecting-IP` solo si el socket viene de cloudflared.
- Si cloudflared corre en Docker, el origen puede ver `172.x`. Usa `TRUST_PROXY=uniquelocal` o la subred del contenedor.

## IP por restaurante

`restaurantes.ip_permitida` acepta:

- IP exacta: `190.85.12.34`
- Primeros 3 octetos: `190.85.12` equivale a `/24`
- CIDR: `190.85.12.0/24`
- Varios valores separados por coma.

La regla debe ser la **IP pública** del restaurante, no la LAN. Contabo no ve `192.168.x.x` porque el router hace NAT. Todos los dispositivos del restaurante salen por la misma IP pública; el DHCP interno sigue funcionando normal.

Si la IP pública es dinámica, `ip_permitida` puede dejar de coincidir. En ese caso usa IP fija del ISP, actualización automática desde un agente, o Cloudflare Access en lugar de IP.

## Seguridad

- No expongas el puerto `9100` de impresoras por el túnel.
- No actives `TRUST_CLOUDFLARE` si Express está expuesto directamente a Internet.
- Mantén el puerto de Express cerrado al público.
- Usa Cloudflare WAF y rate limiting como capa adicional, no como sustituto del login.
- La IP es una señal de red; para asistencia usa además dispositivo enrolado y PIN.
