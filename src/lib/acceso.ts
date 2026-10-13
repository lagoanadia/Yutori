// Protección del panel con Cloudflare Access.
// Cloudflare pone delante del panel una pantalla de acceso (código por email) y, si la persona entra,
// añade a la petición un token firmado (cabecera Cf-Access-Jwt-Assertion). Aquí comprobamos que ese token
// es auténtico y es para nuestra aplicación: así nadie puede saltarse la pantalla llamando directamente al Worker.
import { createRemoteJWKSet, jwtVerify } from 'jose';

let claves: ReturnType<typeof createRemoteJWKSet> | undefined;

export async function usuarioDeAccess(request: Request, team: string, aud: string): Promise<string | null> {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || !team || !aud) return null;

  const emisor = `https://${team}.cloudflareaccess.com`;
  claves ??= createRemoteJWKSet(new URL(`${emisor}/cdn-cgi/access/certs`));
  try {
    const { payload } = await jwtVerify(token, claves, { issuer: emisor, audience: aud });
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}
