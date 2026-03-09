import cors from 'cors'
import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import session from 'express-session'
import { ConfidentialClientApplication } from '@azure/msal-node'
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const PORT = Number(process.env.PORT || 8080)
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
const BACKEND_ORIGIN = getBackendOrigin()
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.SECRET_KEY ||
  'change-me-before-production'

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'
const OUTLOOK_REDIRECT_PATH = '/auth/outlook/callback'
const OUTLOOK_REDIRECT_URI = `${BACKEND_ORIGIN}${OUTLOOK_REDIRECT_PATH}`
const OUTLOOK_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.Read',
]
const OUTLOOK_AUTH_DIR = path.join(__dirname, '.auth_flows')
const OUTLOOK_TOKEN_DIR = path.join(__dirname, '.token_cache')
const OUTLOOK_STATE_TTL_MS = 10 * 60 * 1000

const app = express()
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  }),
)
app.use(express.json())
app.use(
  session({
    name: 'mimi_session',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
)

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
})

const plaidClient = new PlaidApi(plaidConfig)
const plaidTokenStore = {}
const outlookTokenCacheStore = new Map()

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function getBackendOrigin() {
  const fallback = `http://localhost:${PORT}`
  const configured = process.env.BACKEND_ORIGIN
  if (!configured) return fallback

  try {
    const url = new URL(configured)
    const isLocalhost = ['localhost', '127.0.0.1'].includes(url.hostname)
    if (isLocalhost && url.port && Number(url.port) !== PORT) {
      return fallback
    }
    return url.origin
  } catch {
    return fallback
  }
}

function ensureOutlookConfigured() {
  return Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET)
}

function createMsalApp() {
  if (!ensureOutlookConfigured()) {
    throw new Error('Outlook is not configured. Set MS_CLIENT_ID and MS_CLIENT_SECRET.')
  }

  const tenantId = process.env.MS_TENANT_ID || 'consumers'
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MS_CLIENT_ID,
      clientSecret: process.env.MS_CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  })
}

function getOutlookStatePath(state) {
  const safeName = crypto.createHash('sha256').update(state).digest('hex').slice(0, 32)
  return path.join(OUTLOOK_AUTH_DIR, `${safeName}.json`)
}

function getOutlookTokenPath(userId) {
  const safeName = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 32)
  return path.join(OUTLOOK_TOKEN_DIR, `${safeName}.json`)
}

async function saveOutlookState(state) {
  await fs.mkdir(OUTLOOK_AUTH_DIR, { recursive: true })
  await fs.writeFile(
    getOutlookStatePath(state),
    JSON.stringify({ state, createdAt: Date.now() }),
    'utf8',
  )
}

async function consumeOutlookState(state) {
  try {
    const filePath = getOutlookStatePath(state)
    const payload = JSON.parse(await fs.readFile(filePath, 'utf8'))
    await fs.rm(filePath, { force: true })
    return Date.now() - payload.createdAt <= OUTLOOK_STATE_TTL_MS
  } catch {
    return false
  }
}

const OUTLOOK_LAST_USER_PATH = path.join(OUTLOOK_TOKEN_DIR, '_last_user.json')

async function persistOutlookTokenCache(userId, serializedCache) {
  outlookTokenCacheStore.set(userId, serializedCache)
  await fs.mkdir(OUTLOOK_TOKEN_DIR, { recursive: true })
  await fs.writeFile(getOutlookTokenPath(userId), serializedCache, 'utf8')
  await fs.writeFile(OUTLOOK_LAST_USER_PATH, JSON.stringify({ userId }), 'utf8')
}

async function getLastOutlookUserId() {
  try {
    const data = JSON.parse(await fs.readFile(OUTLOOK_LAST_USER_PATH, 'utf8'))
    return data.userId || null
  } catch {
    return null
  }
}

async function readOutlookTokenCache(userId) {
  if (outlookTokenCacheStore.has(userId)) {
    return outlookTokenCacheStore.get(userId)
  }

  try {
    const serialized = await fs.readFile(getOutlookTokenPath(userId), 'utf8')
    outlookTokenCacheStore.set(userId, serialized)
    return serialized
  } catch {
    return null
  }
}

function encodeSegment(value) {
  return encodeURIComponent(value)
}

function normalizeRecipients(input) {
  return (input || []).map((address) => ({
    emailAddress: { address },
  }))
}

function mapRecipient(raw) {
  if (!raw?.emailAddress) return null
  return {
    emailAddress: {
      name: raw.emailAddress.name || null,
      address: raw.emailAddress.address || '',
    },
  }
}

function mapAttachment(raw) {
  return {
    id: raw.id,
    name: raw.name || '',
    contentType: raw.contentType || 'application/octet-stream',
    size: raw.size || 0,
  }
}

function mapCalendarEvent(raw) {
  if (!raw) return null

  return {
    id: raw.id,
    provider: 'outlook',
    subject: raw.subject || null,
    bodyPreview: raw.bodyPreview || null,
    start: raw.start || null,
    end: raw.end || null,
    isAllDay: raw.isAllDay ?? false,
    isCancelled: raw.isCancelled ?? false,
    showAs: raw.showAs || null,
    type: raw.type || null,
    importance: raw.importance || 'normal',
    sensitivity: raw.sensitivity || 'normal',
    location: raw.location || null,
    organizer: raw.organizer || null,
    attendees: raw.attendees || [],
    webLink: raw.webLink || null,
    onlineMeetingUrl: raw.onlineMeetingUrl || null,
    createdDateTime: raw.createdDateTime || null,
    lastModifiedDateTime: raw.lastModifiedDateTime || null,
  }
}

function mapMessage(raw) {
  return {
    id: raw.id,
    provider: 'outlook',
    subject: raw.subject || null,
    bodyPreview: raw.bodyPreview || null,
    bodyContent: raw.body?.content || null,
    bodyContentType: raw.body?.contentType || 'text',
    from: mapRecipient(raw.from),
    toRecipients: (raw.toRecipients || []).map(mapRecipient).filter(Boolean),
    ccRecipients: (raw.ccRecipients || []).map(mapRecipient).filter(Boolean),
    bccRecipients: (raw.bccRecipients || []).map(mapRecipient).filter(Boolean),
    receivedAt: raw.receivedDateTime || null,
    sentAt: raw.sentDateTime || null,
    isRead: raw.isRead ?? null,
    isDraft: raw.isDraft ?? null,
    importance: raw.importance || 'normal',
    hasAttachments: raw.hasAttachments || false,
    attachments: (raw.attachments || []).map(mapAttachment),
    conversationId: raw.conversationId || null,
    parentFolderId: raw.parentFolderId || null,
    webLink: raw.webLink || null,
  }
}

async function graphRequest(method, resourcePath, accessToken, { query, body } = {}) {
  const url = new URL(`${GRAPH_BASE_URL}${resourcePath}`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  if (query?.$search) {
    headers.ConsistencyLevel = 'eventual'
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const details = await response.text()
    throw new Error(`Graph request failed (${response.status}): ${details}`)
  }

  if (response.status === 202 || response.status === 204) {
    return null
  }

  return response.json()
}

async function getOutlookAccessTokenByUserId(userId) {
  const serializedCache = await readOutlookTokenCache(userId)
  if (!serializedCache) {
    const error = new Error('No cached Outlook session found. Please authenticate again.')
    error.statusCode = 401
    throw error
  }

  const appInstance = createMsalApp()
  const tokenCache = appInstance.getTokenCache()
  await tokenCache.deserialize(serializedCache)

  const accounts = await tokenCache.getAllAccounts()
  if (!accounts.length) {
    const error = new Error('Outlook account cache is empty. Please authenticate again.')
    error.statusCode = 401
    throw error
  }

  const result = await appInstance.acquireTokenSilent({
    account: accounts[0],
    scopes: OUTLOOK_SCOPES,
  })

  if (!result?.accessToken) {
    const error = new Error('Could not refresh Outlook access token. Please authenticate again.')
    error.statusCode = 401
    throw error
  }

  await persistOutlookTokenCache(userId, await tokenCache.serialize())
  return result.accessToken
}

async function getOutlookAccessTokenFallback() {
  const files = await fs.readdir(OUTLOOK_TOKEN_DIR).catch(() => [])
  const cacheFiles = files.filter((f) => f !== '_last_user.json' && f.endsWith('.json'))
  const preferredUserId = await getLastOutlookUserId()

  const withStats = await Promise.all(
    cacheFiles.map(async (f) => {
      const stat = await fs.stat(path.join(OUTLOOK_TOKEN_DIR, f))
      return { file: f, mtime: stat.mtimeMs }
    }),
  )
  withStats.sort((a, b) => b.mtime - a.mtime)

  const allCandidates = []

  for (const { file } of withStats) {
    try {
      const filePath = path.join(OUTLOOK_TOKEN_DIR, file)
      const serialized = await fs.readFile(filePath, 'utf8')
      const appInstance = createMsalApp()
      const tokenCache = appInstance.getTokenCache()
      await tokenCache.deserialize(serialized)
      const accounts = await tokenCache.getAllAccounts()
      for (const account of accounts) {
        const isPreferred = preferredUserId && account.homeAccountId === preferredUserId
        allCandidates.push({ account, appInstance, tokenCache, filePath, isPreferred })
      }
    } catch {
      continue
    }
  }

  allCandidates.sort((a, b) => (b.isPreferred ? 1 : 0) - (a.isPreferred ? 1 : 0))

  for (const { account, appInstance, tokenCache, filePath, isPreferred } of allCandidates) {
    try {
      const result = await appInstance.acquireTokenSilent({
        account,
        scopes: OUTLOOK_SCOPES,
      })
      if (result?.accessToken) {
        await fs.writeFile(filePath, await tokenCache.serialize(), 'utf8')
        return result.accessToken
      }
    } catch {
      continue
    }
  }

  const error = new Error('No valid Outlook session found. Please authenticate again.')
  error.statusCode = 401
  throw error
}

async function getOutlookAccessToken(req) {
  const userId =
    req.outlookUserId ||
    req.session?.outlook?.userId ||
    req.headers['x-outlook-user-id']

  if (userId) {
    try {
      return await getOutlookAccessTokenByUserId(userId)
    } catch {
      // userId didn't work — fall through to fallback
    }
  }

  return getOutlookAccessTokenFallback()
}

function getBodyValue(body, camelKey, snakeKey, fallback) {
  if (Object.hasOwn(body, camelKey)) return body[camelKey]
  if (Object.hasOwn(body, snakeKey)) return body[snakeKey]
  return fallback
}

function buildDraftPayload(body, { partial = false } = {}) {
  const payload = {}
  const subject = getBodyValue(body, 'subject', 'subject', undefined)
  const content = getBodyValue(body, 'body', 'body', undefined)
  const bodyType = getBodyValue(body, 'bodyType', 'body_type', 'HTML')
  const toRecipients = getBodyValue(body, 'toRecipients', 'to_recipients', undefined)
  const ccRecipients = getBodyValue(body, 'ccRecipients', 'cc_recipients', undefined)
  const bccRecipients = getBodyValue(body, 'bccRecipients', 'bcc_recipients', undefined)
  const importance = getBodyValue(body, 'importance', 'importance', 'normal')

  if (!partial || subject !== undefined) payload.subject = subject || ''
  if (!partial || content !== undefined) {
    payload.body = { contentType: bodyType, content: content || '' }
  }
  if (!partial || toRecipients !== undefined) payload.toRecipients = normalizeRecipients(toRecipients)
  if (!partial || ccRecipients !== undefined) payload.ccRecipients = normalizeRecipients(ccRecipients)
  if (!partial || bccRecipients !== undefined) payload.bccRecipients = normalizeRecipients(bccRecipients)
  payload.importance = importance

  return payload
}

async function requireOutlookSession(req, res, next) {
  const userId =
    req.session?.outlook?.userId ||
    req.headers['x-outlook-user-id'] ||
    await getLastOutlookUserId()

  if (userId) {
    req.outlookUserId = userId
    return next()
  }

  try {
    const files = await fs.readdir(OUTLOOK_TOKEN_DIR).catch(() => [])
    if (files.some((f) => f !== '_last_user.json' && f.endsWith('.json'))) {
      return next()
    }
  } catch {}

  return res.status(401).json({
    error: 'Not authenticated. Please connect your Outlook account first.',
  })
}

// ---------------------------------------------------------------------------
// Plaid routes (preserved from the existing implementation)
// ---------------------------------------------------------------------------

app.post('/api/plaid/create-link-token', async (req, res) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: 'mimi-user-1' },
      client_name: 'Mimi Assistant',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    })
    res.json({ link_token: response.data.link_token })
  } catch (err) {
    console.error('create-link-token error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Failed to create link token' })
  }
})

app.post('/api/plaid/exchange-token', async (req, res) => {
  try {
    const { public_token } = req.body
    const response = await plaidClient.itemPublicTokenExchange({ public_token })
    const accessToken = response.data.access_token
    const itemId = response.data.item_id

    plaidTokenStore[itemId] = accessToken

    res.json({ item_id: itemId })
  } catch (err) {
    console.error('exchange-token error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Failed to exchange token' })
  }
})

app.post('/api/plaid/data', async (req, res) => {
  try {
    const { item_id } = req.body
    const accessToken = plaidTokenStore[item_id]
    if (!accessToken) {
      return res.status(400).json({ error: 'No access token for this item' })
    }

    const [balanceRes, txnRes] = await Promise.all([
      plaidClient.accountsBalanceGet({ access_token: accessToken }),
      plaidClient.transactionsSync({ access_token: accessToken }),
    ])

    const accounts = balanceRes.data.accounts.map((account) => ({
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      balances: account.balances,
      mask: account.mask,
    }))

    const transactions = txnRes.data.added.map((transaction) => ({
      date: transaction.date,
      name: transaction.name,
      amount: transaction.amount,
      category:
        transaction.personal_finance_category?.primary || transaction.category?.[0],
      merchant: transaction.merchant_name,
    }))

    res.json({ accounts, transactions })
  } catch (err) {
    console.error('data error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Failed to fetch bank data' })
  }
})

// ---------------------------------------------------------------------------
// Outlook auth routes
// ---------------------------------------------------------------------------

app.get('/auth/outlook/login', async (req, res) => {
  if (!ensureOutlookConfigured()) {
    return res.status(500).json({
      error: 'Outlook is not configured. Set MS_CLIENT_ID, MS_CLIENT_SECRET and MS_TENANT_ID.',
    })
  }

  try {
    const state = crypto.randomUUID()
    await saveOutlookState(state)

    const msalApp = createMsalApp()
    const authUrl = await msalApp.getAuthCodeUrl({
      scopes: OUTLOOK_SCOPES,
      redirectUri: OUTLOOK_REDIRECT_URI,
      state,
      prompt: 'select_account',
    })

    res.redirect(authUrl)
  } catch (err) {
    console.error('outlook login error:', err.message)
    res.status(500).json({ error: 'Failed to start Outlook login' })
  }
})

app.get('/auth/outlook/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query

  if (error) {
    return res.status(400).json({
      error: errorDescription || error,
    })
  }

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing Outlook callback parameters.' })
  }

  try {
    const validState = await consumeOutlookState(String(state))
    if (!validState) {
      return res
        .status(400)
        .json({ error: 'Auth flow not found or expired. Please start login again.' })
    }

    const msalApp = createMsalApp()
    const tokenCache = msalApp.getTokenCache()
    const result = await msalApp.acquireTokenByCode({
      code: String(code),
      scopes: OUTLOOK_SCOPES,
      redirectUri: OUTLOOK_REDIRECT_URI,
    })

    const claims = result.idTokenClaims || {}
    const userId =
      claims.oid ||
      claims.sub ||
      result.account?.homeAccountId ||
      result.account?.localAccountId

    if (!userId) {
      return res
        .status(500)
        .json({ error: 'Could not determine Outlook user identifier from token response.' })
    }

    await persistOutlookTokenCache(userId, await tokenCache.serialize())
    req.session.outlook = {
      userId,
      displayName: claims.name || result.account?.name || '',
      email: claims.preferred_username || result.account?.username || '',
      provider: 'outlook',
    }

    res.send(`<!DOCTYPE html><html><head><title>Outlook Connected</title></head><body><script>
      if (window.opener) { window.close(); }
      else { window.location.href = ${JSON.stringify(`${FRONTEND_ORIGIN}/dashboard?auth=success`)}; }
    </script><p>Outlook connected. You may close this window.</p></body></html>`)
  } catch (err) {
    console.error('outlook callback error:', err.message)
    res.status(500).json({ error: 'Failed to complete Outlook login' })
  }
})

app.get('/auth/outlook/status', async (req, res) => {
  const outlookSession = req.session.outlook
  let userId = outlookSession?.userId

  if (!userId) {
    userId = req.headers['x-outlook-user-id'] || await getLastOutlookUserId()
  }

  if (userId) {
    const serializedCache = await readOutlookTokenCache(userId)
    if (serializedCache) {
      return res.json({
        authenticated: true,
        provider: 'outlook',
        userId,
        displayName: outlookSession?.displayName || '',
        email: outlookSession?.email || '',
      })
    }
  }

  try {
    const files = await fs.readdir(OUTLOOK_TOKEN_DIR).catch(() => [])
    const cacheFile = files.find((f) => f !== '_last_user.json' && f.endsWith('.json'))
    if (cacheFile) {
      return res.json({
        authenticated: true,
        provider: 'outlook',
        userId: '',
        displayName: outlookSession?.displayName || '',
        email: outlookSession?.email || '',
      })
    }
  } catch {}

  res.json({ authenticated: false })
})

app.post('/auth/outlook/logout', async (req, res) => {
  const userId = req.session.outlook?.userId
  if (userId) {
    outlookTokenCacheStore.delete(userId)
    await fs.rm(getOutlookTokenPath(userId), { force: true }).catch(() => {})
  }

  req.session.destroy(() => {
    res.json({ status: 'logged_out' })
  })
})

// ---------------------------------------------------------------------------
// Outlook email routes
// ---------------------------------------------------------------------------

app.get('/api/email/messages', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)
    const folder = String(req.query.folder || 'inbox')
    const top = Number(req.query.top || 25)
    const skip = Number(req.query.skip || 0)
    const orderBy = String(req.query.order_by || req.query.orderBy || 'receivedDateTime desc')

    const query = {
      $top: top,
      $skip: skip,
      $orderby: orderBy,
      $select:
        'id,subject,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,' +
        'receivedDateTime,sentDateTime,isRead,isDraft,importance,' +
        'hasAttachments,conversationId,parentFolderId,webLink',
    }

    const data = await graphRequest(
      'GET',
      `/me/mailFolders/${encodeSegment(folder)}/messages`,
      accessToken,
      { query },
    )

    res.json({
      messages: (data.value || []).map(mapMessage),
      nextLink: data['@odata.nextLink'] || null,
      totalCount: data['@odata.count'] || null,
    })
  } catch (err) {
    console.error('list email messages error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.get('/api/email/messages/:messageId', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)
    const data = await graphRequest(
      'GET',
      `/me/messages/${encodeSegment(req.params.messageId)}`,
      accessToken,
      {
        query: {
          $expand: 'attachments($select=id,name,contentType,size)',
        },
      },
    )

    res.json(mapMessage(data))
  } catch (err) {
    console.error('get email message error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.post('/api/email/send', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)
    const subject = getBodyValue(req.body, 'subject', 'subject', '')
    const body = getBodyValue(req.body, 'body', 'body', '')
    const bodyType = getBodyValue(req.body, 'bodyType', 'body_type', 'HTML')
    const toRecipients = getBodyValue(req.body, 'toRecipients', 'to_recipients', [])
    const ccRecipients = getBodyValue(req.body, 'ccRecipients', 'cc_recipients', [])
    const bccRecipients = getBodyValue(req.body, 'bccRecipients', 'bcc_recipients', [])
    const importance = getBodyValue(req.body, 'importance', 'importance', 'normal')
    const saveToSentItems = getBodyValue(
      req.body,
      'saveToSentItems',
      'save_to_sent_items',
      true,
    )

    await graphRequest('POST', '/me/sendMail', accessToken, {
      body: {
        message: {
          subject,
          body: { contentType: bodyType, content: body },
          toRecipients: normalizeRecipients(toRecipients),
          ccRecipients: normalizeRecipients(ccRecipients),
          bccRecipients: normalizeRecipients(bccRecipients),
          importance,
        },
        saveToSentItems,
      },
    })

    res.status(202).json({ status: 'sent' })
  } catch (err) {
    console.error('send email error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.post('/api/email/draft', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)
    const data = await graphRequest('POST', '/me/messages', accessToken, {
      body: buildDraftPayload(req.body),
    })

    res.status(201).json(mapMessage(data))
  } catch (err) {
    console.error('create email draft error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.patch('/api/email/draft/:messageId', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)
    const data = await graphRequest(
      'PATCH',
      `/me/messages/${encodeSegment(req.params.messageId)}`,
      accessToken,
      {
        body: buildDraftPayload(req.body, { partial: true }),
      },
    )

    res.json(mapMessage(data))
  } catch (err) {
    console.error('update email draft error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.post('/api/email/draft/:messageId/send', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)
    await graphRequest(
      'POST',
      `/me/messages/${encodeSegment(req.params.messageId)}/send`,
      accessToken,
    )

    res.status(202).json({ status: 'sent' })
  } catch (err) {
    console.error('send email draft error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.post('/api/email/messages/:messageId/reply', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)
    const comment = getBodyValue(req.body, 'comment', 'comment', '')

    await graphRequest(
      'POST',
      `/me/messages/${encodeSegment(req.params.messageId)}/reply`,
      accessToken,
      {
        body: { comment },
      },
    )

    res.status(202).json({ status: 'replied' })
  } catch (err) {
    console.error('reply email error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.post('/api/email/messages/:messageId/forward', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)
    const comment = getBodyValue(req.body, 'comment', 'comment', '')
    const toRecipients = getBodyValue(req.body, 'toRecipients', 'to_recipients', [])

    await graphRequest(
      'POST',
      `/me/messages/${encodeSegment(req.params.messageId)}/forward`,
      accessToken,
      {
        body: {
          comment,
          toRecipients: normalizeRecipients(toRecipients),
        },
      },
    )

    res.status(202).json({ status: 'forwarded' })
  } catch (err) {
    console.error('forward email error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// ---------------------------------------------------------------------------
// Outlook calendar routes
// ---------------------------------------------------------------------------

app.get('/api/calendar/events', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)

    const top = Number(req.query.top || 10)
    const orderBy = String(
      req.query.order_by || req.query.orderBy || 'start/dateTime desc',
    )

    const query = { $top: top, $orderby: orderBy }

    const data = await graphRequest('GET', '/me/events', accessToken, { query })

    res.json({
      events: (data.value || []).map(mapCalendarEvent),
      nextLink: data['@odata.nextLink'] || null,
      totalCount: data['@odata.count'] || null,
    })
  } catch (err) {
    console.error('list calendar events error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.delete('/api/email/messages/:messageId', requireOutlookSession, async (req, res) => {
  try {
    const accessToken = await getOutlookAccessToken(req)
    await graphRequest(
      'DELETE',
      `/me/messages/${encodeSegment(req.params.messageId)}`,
      accessToken,
    )

    res.status(204).end()
  } catch (err) {
    console.error('delete email error:', err.message)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    services: {
      plaid: Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET),
      outlook: ensureOutlookConfigured(),
    },
  })
})

app.listen(PORT, async () => {
  console.log(`Backend running on ${BACKEND_ORIGIN}`)

  try {
    const lastUser = await getLastOutlookUserId()
    if (!lastUser) {
      const files = await fs.readdir(OUTLOOK_TOKEN_DIR).catch(() => [])
      const cacheFile = files.find((f) => f !== '_last_user.json' && f.endsWith('.json'))
      if (cacheFile) {
        const serialized = await fs.readFile(path.join(OUTLOOK_TOKEN_DIR, cacheFile), 'utf8')
        const appInstance = createMsalApp()
        const tokenCache = appInstance.getTokenCache()
        await tokenCache.deserialize(serialized)
        const accounts = await tokenCache.getAllAccounts()
        if (accounts.length > 0) {
          const userId = accounts[0].homeAccountId || accounts[0].localAccountId
          if (userId) {
            await fs.writeFile(OUTLOOK_LAST_USER_PATH, JSON.stringify({ userId }), 'utf8')
            outlookTokenCacheStore.set(userId, serialized)
            console.log(`Restored Outlook session for user: ${userId}`)
          }
        }
      }
    }
  } catch (err) {
    console.log('Could not restore Outlook session on startup:', err.message)
  }
})
