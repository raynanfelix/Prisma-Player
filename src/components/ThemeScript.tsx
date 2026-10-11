import { headers } from "next/headers";
import { themeBootstrapScript } from "@/lib/security/inline-scripts";

export default async function ThemeScript() {
  const nonce = (await headers()).get("x-nonce");
  return (
    <script
      nonce={nonce ?? undefined}
      dangerouslySetInnerHTML={{
        __html: themeBootstrapScript(),
      }}
    />
  );
}
