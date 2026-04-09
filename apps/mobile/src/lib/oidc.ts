import Constants from "expo-constants";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { getCurrentUser, setSessionToken } from "./api";

WebBrowser.maybeCompleteAuthSession();

type OidcConfig = {
  issuerUrl?: string;
  clientId?: string;
  audience?: string;
};

function getOidcConfig(): OidcConfig {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  return {
    issuerUrl: typeof extra?.oidcIssuerUrl === "string" ? extra.oidcIssuerUrl : undefined,
    clientId: typeof extra?.oidcClientId === "string" ? extra.oidcClientId : undefined,
    audience: typeof extra?.oidcAudience === "string" ? extra.oidcAudience : undefined
  };
}

export async function signInWithOidc() {
  const config = getOidcConfig();
  if (!config.issuerUrl || !config.clientId) {
    throw new Error("OIDC mobile config is missing. Set oidcIssuerUrl and oidcClientId in app.json extra.");
  }

  const discovery = await AuthSession.fetchDiscoveryAsync(config.issuerUrl);
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: "offense-one"
  });

  const request = new AuthSession.AuthRequest({
    clientId: config.clientId,
    responseType: AuthSession.ResponseType.Code,
    scopes: ["openid", "profile", "email"],
    usePKCE: true,
    redirectUri,
    extraParams: config.audience ? { audience: config.audience } : undefined
  });

  await request.makeAuthUrlAsync(discovery);
  const result = await request.promptAsync(discovery);

  if (result.type !== "success" || !result.params.code) {
    throw new Error("OIDC sign-in was cancelled or did not return an authorization code.");
  }

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: config.clientId,
      code: result.params.code,
      redirectUri,
      extraParams: {
        code_verifier: request.codeVerifier || ""
      }
    },
    discovery
  );

  if (!tokenResponse.accessToken) {
    throw new Error("OIDC token exchange did not return an access token.");
  }

  setSessionToken(tokenResponse.accessToken);
  const profile = await getCurrentUser();

  return {
    token: tokenResponse.accessToken,
    user: profile.user
  };
}
