import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid'

const app = express()
app.use(cors())
app.use(express.json())

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

// In-memory store for access tokens (fine for hackathon / single session)
const tokenStore = {}

// 1) Create a link token for Plaid Link
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

// 2) Exchange public token for access token
app.post('/api/plaid/exchange-token', async (req, res) => {
  try {
    const { public_token } = req.body
    const response = await plaidClient.itemPublicTokenExchange({ public_token })
    const accessToken = response.data.access_token
    const itemId = response.data.item_id

    tokenStore[itemId] = accessToken

    res.json({ item_id: itemId })
  } catch (err) {
    console.error('exchange-token error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Failed to exchange token' })
  }
})

// 3) Get balance + transactions in one call
app.post('/api/plaid/data', async (req, res) => {
  try {
    const { item_id } = req.body
    const accessToken = tokenStore[item_id]
    if (!accessToken) {
      return res.status(400).json({ error: 'No access token for this item' })
    }

    const [balanceRes, txnRes] = await Promise.all([
      plaidClient.accountsBalanceGet({ access_token: accessToken }),
      plaidClient.transactionsSync({ access_token: accessToken }),
    ])

    const accounts = balanceRes.data.accounts.map((a) => ({
      name: a.name,
      type: a.type,
      subtype: a.subtype,
      balances: a.balances,
      mask: a.mask,
    }))

    const transactions = txnRes.data.added.map((t) => ({
      date: t.date,
      name: t.name,
      amount: t.amount,
      category: t.personal_finance_category?.primary || t.category?.[0],
      merchant: t.merchant_name,
    }))

    res.json({ accounts, transactions })
  } catch (err) {
    console.error('data error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Failed to fetch bank data' })
  }
})

const PORT = process.env.PORT || 8080
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})
