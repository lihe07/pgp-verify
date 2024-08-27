import { createSignal, Show } from "solid-js";
import * as openpgp from "openpgp";

async function getPubkey(keyserver: string, email: string): Promise<string> {
  const url = `${keyserver}/vks/v1/by-email/${email}`;
  const response = await fetch(url);
  const data = await response.text();
  return data;
}

interface VerifyResult {
  type: "success" | "expired" | "error";
  message: string;
  pubkeyFingerprint?: string;
  expirationTime?: Date | number | null;
}

export default function Home() {
  const [keyserver, setKeyserver] = createSignal("https://keys.openpgp.org");
  const [email, setEmail] = createSignal("li@imlihe.com");
  const [message, setMessage] = createSignal("");

  const [status, setStatus] = createSignal<VerifyResult | null>(null);
  let textarea: HTMLTextAreaElement;
  let emailInput: HTMLInputElement;

  function reset() {
    setKeyserver("https://keys.openpgp.org");
    setEmail("li@imlihe.com");
    setMessage("");
    setStatus(null);
  }

  const [loading, setLoading] = createSignal(false);

  async function verify() {
    setEmail(emailInput.value);
    setMessage(textarea.value);

    console.log("Verifying...");
    if (loading()) return;
    setLoading(true);

    let signedMessage: openpgp.CleartextMessage;
    try {
      console.log(message());
      signedMessage = await openpgp.readCleartextMessage({
        cleartextMessage: message(),
      });
    } catch (e) {
      console.error(e);
      setStatus({ type: "error", message: "Could not parse message" });
      setLoading(false);
      return;
    }

    let pubkey: openpgp.Key;

    try {
      // Check if pubkey exists in cache
      let pubkeyText;
      if (sessionStorage.getItem(email())) {
        console.log("Pubkey exists in cache");
        pubkeyText = sessionStorage.getItem(email())!;

        // Await for 0.3s
        await new Promise((resolve) => setTimeout(resolve, 300));
      } else {
        console.log("Fetching pubkey from keyserver");
        pubkeyText = await getPubkey(keyserver(), email());
        sessionStorage.setItem(email(), pubkeyText);
      }

      pubkey = await openpgp.readKey({ armoredKey: pubkeyText });
      console.log(pubkey);
    } catch (e) {
      console.error(e);
      setStatus({ type: "error", message: "Could not fetch pubkey" });
      setLoading(false);
      return;
    }

    const pubkeyFingerprint = pubkey.getFingerprint();

    // Check if key is expired
    const expirationTime = await pubkey.getExpirationTime();
    if (
      expirationTime !== Infinity &&
      (expirationTime === null || expirationTime < new Date())
    ) {
      setStatus({
        type: "expired",
        message: "Public key expired or revoked",
        pubkeyFingerprint,
        expirationTime,
      });
      setLoading(false);
      return;
    }

    // Verify
    try {
      const verificationResult = await openpgp.verify({
        message: signedMessage,
        verificationKeys: pubkey,
        expectSigned: true,
      });

      const { verified, keyID } = verificationResult.signatures[0];
      await verified;
      console.log("Signature verified");
      console.log(keyID.toHex());

      // Get sign time
      setStatus({
        type: "success",
        message: "Signature verified",
        pubkeyFingerprint,
        expirationTime,
      });
    } catch (e) {
      console.error(e);
      setStatus({ type: "error", message: "Could not verify message" });
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  return (
    <main class="min-h-screen flex items-center justify-center">
      <div class="card bg-base-200 shadow-xl w-full max-w-md">
        <div class="card-body">
          <h1 class="card-title">Verify PGP Signed Message</h1>

          <div class="h-1" />

          <label class="form-control">
            <div class="label">
              <span class="label-text">Keyserver</span>
            </div>
            <input
              type="text"
              disabled
              value={keyserver()}
              class="input input-bordered w-full max-w-md"
            />
          </label>

          <label class="form-control">
            <div class="label">
              <span class="label-text">Email</span>
            </div>
            <input
              type="email"
              ref={emailInput!}
              disabled={loading()}
              value={email()}
              onInput={(e) => setEmail(e.target.value)}
              class="input input-bordered w-full max-w-md"
            />
          </label>

          <label class="form-control">
            <div class="label">
              <span class="label-text">Message</span>
            </div>
            <textarea
              ref={textarea!}
              class="textarea textarea-bordered w-full max-w-md h-32 leading-tight font-mono"
              placeholder="-----BEGIN PGP SIGNED MESSAGE-----"
              value={message()}
              disabled={loading()}
              onInput={(e) => setMessage(e.target.value)}
            ></textarea>
          </label>

          <div
            role="alert"
            class="card sm:card-normal card-compact mt-3"
            classList={{
              hidden: !status(),
              "bg-success/40": status()?.type === "success",
              "bg-error/40": status()?.type === "error",
            }}
          >
            <div class="card-body">
              <h3 class="card-title sm:text-xl text-lg">
                {
                  {
                    success: "Good Signature! 🎉",
                    error: "Failed to verify message! 🔥",
                    expired: "Public key expired! ⏰",
                  }[status()?.type || "error"]
                }
              </h3>
              <Show when={status()?.type === "error"}>
                <p>{status()?.message}</p>
              </Show>
              <Show when={status()?.type === "expired"}>
                <p>Public Key FingerPrint:</p>
                <p class="kbd py-1 font-mono break-all">
                  {status()?.pubkeyFingerprint}
                </p>
                <p>Expires at: {status()?.expirationTime?.toLocaleString()}</p>
              </Show>
              <Show when={status()?.type === "success"}>
                <p>Public Key FingerPrint:</p>
                <p class="kbd py-1 font-mono break-all">
                  {status()?.pubkeyFingerprint}
                </p>
                <Show
                  when={status()?.expirationTime !== Infinity}
                  fallback={<p>Pubkey never expires!</p>}
                >
                  <p>
                    Public Key expires at:{" "}
                    {status()?.expirationTime?.toLocaleString()}
                  </p>
                </Show>
              </Show>
            </div>
          </div>

          <div class="card-actions justify-between mt-3">
            <button class="btn" onClick={reset} disabled={loading()}>
              Reset
            </button>
            <button
              class="btn btn-primary"
              classList={{ "no-animation": loading() }}
              onClick={verify}
            >
              <span
                class="loading loading-spinner"
                classList={{ hidden: !loading() }}
              ></span>
              <span>Verify</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
