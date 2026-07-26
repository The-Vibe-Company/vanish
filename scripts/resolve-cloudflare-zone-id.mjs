const hostname = process.argv[2] || 'vanish.sh';
const token = process.env.CUSTOM_HOSTNAMES_API_TOKEN;

if (!token) {
  throw new Error('CUSTOM_HOSTNAMES_API_TOKEN is required');
}

const response = await fetch(
  `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(hostname)}&status=active&per_page=1`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  },
);
const payload = await response.json();
const zone = payload?.success && Array.isArray(payload.result)
  ? payload.result.find(candidate => candidate?.name === hostname)
  : null;

if (!response.ok || !zone?.id) {
  throw new Error(`Unable to resolve the Cloudflare zone for ${hostname}`);
}

process.stdout.write(zone.id);
