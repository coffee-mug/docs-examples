export default {
	async fetch(request): Promise<Response> {
		const HOMEPAGE_URL = "https://tutorial.cloudflareworkers.com/";
		const PROTECTED_TYPE = "image/";

		// Fetch the original request
		const response = await fetch(request);

		// If it's an image, engage hotlink protection based on the
		// Referer header.
		const referer = request.headers.get("Referer");
		const contentType = response.headers.get("Content-Type") || "";

		if (referer && contentType.startsWith(PROTECTED_TYPE)) {
			// If the hostnames don't match, it's a hotlink
			if (new URL(referer).hostname !== new URL(request.url).hostname) {
				// Redirect the user to your website
				return Response.redirect(HOMEPAGE_URL, 302);
			}
		}

		// Everything is fine, return the response normally.
		return response;
	},
} satisfies ExportedHandler;
