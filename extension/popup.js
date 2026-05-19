const IAM_HOST = 'https://iam.app'

document.getElementById('openIAM').addEventListener('click', () => {
  chrome.tabs.create({ url: IAM_HOST })
})

document.getElementById('openCurrentPage').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return

  chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT' }, async (context) => {
    if (!context) {
      // Content script not ready — navigate to iAM with page URL as context
      const intent = encodeURIComponent(`I found something on ${tab.url}`)
      chrome.tabs.create({ url: `${IAM_HOST}/?intent=${intent}` })
      return
    }

    // Send to background to call /api/capture
    chrome.runtime.sendMessage({ type: 'CAPTURE_PAGE', payload: context }, (response) => {
      if (response?.stageUrl) {
        chrome.tabs.create({ url: `${IAM_HOST}${response.stageUrl}` })
      } else {
        chrome.tabs.create({ url: IAM_HOST })
      }
      window.close()
    })
  })
})

// Show sign-in status
async function checkStatus() {
  const cookies = await chrome.cookies.getAll({ domain: new URL(IAM_HOST).hostname })
  const hasSession = cookies.some(c =>
    c.name === '__Secure-next-auth.session-token' || c.name === 'next-auth.session-token'
  )
  const el = document.getElementById('status')
  if (hasSession) {
    el.innerHTML = '<span class="signed-in">● Signed in to iAM</span>'
  } else {
    el.textContent = 'Not signed in — open iAM to sign in'
  }
}

checkStatus()
