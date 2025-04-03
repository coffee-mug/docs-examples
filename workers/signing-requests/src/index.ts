import { Buffer } from "node:buffer";

const encoder = new TextEncoder();

// How long an HMAC token should be valid for, in seconds
const EXPIRY = 60;

interface Env {
	SECRET_DATA: string;
}
export default {
	async fetch(request, env): Promise<Response> {
		// You will need some secret data to use as a symmetric key. This should be
		// attached to your Worker as an encrypted secret.
		// Refer to https://developers.cloudflare.com/workers/configuration/secrets/
		const secretKeyData = encoder.encode(
			env.SECRET_DATA ?? "my secret symmetric key",
		);

		// Import your secret as a CryptoKey for both 'sign' and 'verify' operations
		const key = await crypto.subtle.importKey(
			"raw",
			secretKeyData,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign", "verify"],
		);

		const url = new URL(request.url);

		// This is a demonstration Worker that allows unauthenticated access to /generate
		// In a real application you would want to make sure that
		// users could only generate signed URLs when authenticated
		if (url.pathname.startsWith("/generate/")) {
			url.pathname = url.pathname.replace("/generate/", "/");

			const timestamp = Math.floor(Date.now() / 1000);

			// This contains all the data about the request that you want to be able to verify
			// Here we only sign the timestamp and the pathname, but often you will want to
			// include more data (for instance, the URL hostname or query parameters)
			const dataToAuthenticate = `${url.pathname}${timestamp}`;

			const mac = await crypto.subtle.sign(
				"HMAC",
				key,
				encoder.encode(dataToAuthenticate),
			);

			// Refer to https://developers.cloudflare.com/workers/runtime-apis/nodejs/
			// for more details on using NodeJS APIs in Workers
			const base64Mac = Buffer.from(mac).toString("base64");

			url.searchParams.set("verify", `${timestamp}-${base64Mac}`);

			return new Response(`${url.pathname}${url.search}`);
			// Verify all non /generate requests
		} else {
			// Make sure you have the minimum necessary query parameters.
			if (!url.searchParams.has("verify")) {
				return new Response("Missing query parameter", { status: 403 });
			}

			const [timestamp, hmac] = url.searchParams.get("verify").split("-");

			const assertedTimestamp = Number(timestamp);

			const dataToAuthenticate = `${url.pathname}${assertedTimestamp}`;

			const receivedMac = Buffer.from(hmac, "base64");

			// Use crypto.subtle.verify() to guard against timing attacks. Since HMACs use
			// symmetric keys, you could implement this by calling crypto.subtle.sign() and
			// then doing a string comparison -- this is insecure, as string comparisons
			// bail out on the first mismatch, which leaks information to potential
			// attackers.
			const verified = await crypto.subtle.verify(
				"HMAC",
				key,
				receivedMac,
				encoder.encode(dataToAuthenticate),
			);

			if (!verified) {
				return new Response("Invalid MAC", { status: 403 });
			}

			// Signed requests expire after one minute. Note that this value should depend on your specific use case
			if (Date.now() / 1000 > assertedTimestamp + EXPIRY) {
				return new Response(
					`URL expired at ${new Date((assertedTimestamp + EXPIRY) * 1000)}`,
					{ status: 403 },
				);
			}
		}

		return fetch(new URL(url.pathname, "https://example.com"), request);
	},
} satisfies ExportedHandler<Env>;
