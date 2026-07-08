// Smart Search Browser Extension — Service Worker (Manifest V3)
// Handles API calls to /api/capture from the content script.

const SMARTSEARCH_HOST = 'https://smartsearch.app'

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_PAGE') {
    handleCapture(message.payload).then(sendResponse).catch(err => {
      console.error('[Smart Search extension] capture failed', err)
      sendResponse({ error: err.message })
    })
    return true  // keep message channel open for async response
  }
})

async function handleCapture(payload) {
  // Get the session cookie to authenticate the request
  const cookies = await chrome.cookies.getAll({ domain: new URL(SMARTSEARCH_HOST).hostname })
  const sessionCookie = cookies.find(c => c.name === '__Secure-next-auth.session-token' || c.name === 'next-auth.session-token')

  const res = await fetch(`${SMARTSEARCH_HOST}/api/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(sessionCookie ? { Cookie: `${sessionCookie.name}=${sessionCookie.value}` } : {}),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new Error(err.error ?? 'Capture failed')
  }

  return res.json()
}
