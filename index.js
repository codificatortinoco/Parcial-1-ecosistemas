const express = require("express")
const path = require("path")
const db = require("./db-util")

const app = express()

app.use(express.json())
app.use("/players-app", express.static(path.join(__dirname, "players_app")))
app.use("/monitor-app", express.static(path.join(__dirname, "monitor_app")))

// Helpers
function loadAuctionState() {
  const auction = db.load("auction")
  // If file not initialized, create default
  if (!auction || !auction.auction) {
    const initial = { auction: { isOpen: false, startTime: null, endTime: null } }
    db.save("auction", initial)
    return initial
  }
  return auction
}

function getNextId(items) {
  if (items.length === 0) return 1
  return Math.max(...items.map((i) => i.id)) + 1
}

function getReservedAmountForUser(userId, items) {
  return items
    .filter((it) => it.highestBidder === userId)
    .reduce((sum, it) => sum + (Number(it.highestBid) || 0), 0)
}

function getAvailableBalanceForUser(userId) {
  const users = db.load("users")
  const items = db.load("items")
  const user = users.find((u) => u.id === userId)
  if (!user) return null
  const reserved = getReservedAmountForUser(userId, items)
  return Math.max(0, Number(user.balance) - reserved)
}

// Users
app.post("/users/register", (req, res) => {
  const { name } = req.body || {}
  if (!name || typeof name !== "string" || name.trim() === "") {
    return res.status(400).json({ message: "el nombre es obligatorio" })
  }

  const users = db.load("users")
  if (users.find((u) => u.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ message: "el nombre de usuario ya existe" })
  }

  const newUser = { id: getNextId(users), name: name.trim(), balance: 1000, bids: [] }
  users.push(newUser)
  db.save("users", users)
  return res.status(201).json({ ...newUser, availableBalance: 1000 })
})

// Find user by name (case-insensitive)
app.get("/users/by-name", (req, res) => {
  const { name } = req.query
  if (!name || String(name).trim() === "") {
    return res.status(400).json({ message: "el nombre es obligatorio" })
  }
  const users = db.load("users")
  const user = users.find((u) => u.name.toLowerCase() === String(name).toLowerCase())
  if (!user) return res.status(404).json({ message: "usuario no encontrado" })
  const availableBalance = getAvailableBalanceForUser(user.id)
  res.json({ ...user, availableBalance })
})

app.get("/users/:id", (req, res) => {
  const userId = Number(req.params.id)
  const users = db.load("users")
  const user = users.find((u) => u.id === userId)
  if (!user) return res.status(404).json({ message: "usuario no encontrado" })
  const availableBalance = getAvailableBalanceForUser(user.id)
  res.json({ ...user, availableBalance })
})

// Items
app.get("/items", (req, res) => {
  const items = db.load("items")
  const users = db.load("users")
  const sort = req.query.sort
  if (sort === "highestBid") {
    items.sort((a, b) => Number(b.highestBid) - Number(a.highestBid))
  }
  const enriched = items.map((it) => ({
    ...it,
    highestBidderName: it.highestBidder
      ? (users.find((u) => u.id === it.highestBidder)?.name || String(it.highestBidder))
      : null
  }))
  res.json(enriched)
})

app.get("/items/:id", (req, res) => {
  const id = Number(req.params.id)
  const items = db.load("items")
  const item = items.find((i) => i.id === id)
  if (!item) return res.status(404).json({ message: "item no encontrado" })
  res.json(item)
})

// Bidding
app.post("/items/:id/bid", (req, res) => {
  const id = Number(req.params.id)
  const { userId, amount } = req.body || {}

  const auctionState = loadAuctionState()
  if (!auctionState.auction.isOpen) {
    return res.status(403).json({ message: "la subasta ya está cerrada" })
  }

  const items = db.load("items")
  const users = db.load("users")

  const item = items.find((i) => i.id === id)
  if (!item) return res.status(404).json({ message: "item no encontrado" })
  const user = users.find((u) => u.id === Number(userId))
  if (!user) return res.status(404).json({ message: "usuario no encontrado" })

  const bidAmount = Number(amount)
  if (!Number.isFinite(bidAmount)) {
    return res.status(400).json({ message: "monto inválido" })
  }

  if (bidAmount <= Number(item.highestBid)) {
    return res.status(400).json({ message: "la oferta debe ser mayor a la actual" })
  }

  // Available balance considering reservations
  const totalReserved = getReservedAmountForUser(user.id, items)
  const reservedExcludingCurrent =
    totalReserved - (item.highestBidder === user.id ? Number(item.highestBid) : 0)
  const available = user.balance - reservedExcludingCurrent

  if (bidAmount > available) {
    return res.status(400).json({ message: "saldo insuficiente" })
  }

  // Update item and user bids
  item.highestBid = bidAmount
  item.highestBidder = user.id
  const now = new Date().toISOString()
  user.bids = user.bids || []
  user.bids.push({ itemId: item.id, amount: bidAmount, at: now })

  // Persist
  db.save("items", items)
  db.save("users", users)

  return res.status(200).json({
    itemId: item.id,
    highestBid: item.highestBid,
    highestBidder: user.name,
    availableBalance: getAvailableBalanceForUser(user.id)
  })
})

// Auction control
app.post("/auction/openAll", (req, res) => {
  const state = loadAuctionState()
  if (state.auction.isOpen) {
    return res.status(400).json({ message: "la subasta ya está abierta" })
  }
  state.auction.isOpen = true
  state.auction.startTime = new Date().toISOString()
  state.auction.endTime = null
  db.save("auction", state)
  res.json({ auction: "abierta", startTime: state.auction.startTime })
})

app.post("/auction/closeAll", (req, res) => {
  const state = loadAuctionState()
  if (!state.auction.isOpen) {
    return res.status(400).json({ message: "la subasta ya está cerrada" })
  }

  const users = db.load("users")
  const items = db.load("items")

  const results = []
  items.forEach((item) => {
    if (item.highestBidder) {
      item.sold = true
      const winner = users.find((u) => u.id === item.highestBidder)
      if (winner) {
        winner.balance = Number(winner.balance) - Number(item.highestBid)
        results.push({ itemId: item.id, item: item.name, winner: winner.name, finalBid: item.highestBid })
      }
    }
  })

  db.save("users", users)
  db.save("items", items)

  state.auction.isOpen = false
  state.auction.endTime = new Date().toISOString()
  db.save("auction", state)

  // Append results log
  const log = db.load("results") || []
  log.push({ at: state.auction.endTime, results })
  db.save("results", log)

  res.json({ auction: "cerrada", results })
})

// Utility endpoint for clients to read auction state
app.get("/auction/state", (req, res) => {
  const state = loadAuctionState()
  res.json(state)
})

// Reset for next round: re-seed items, reset users' bids and balances, keep results log
app.post("/auction/resetRound", (req, res) => {
  try {
    // Reload initial items from seed file on disk
    const fs = require("fs")
    const path = require("path")
    const itemsSeed = JSON.parse(fs.readFileSync(path.join(__dirname, "db", "items.json"), "utf8"))
    // Ensure items are reset to base state
    const resetItems = itemsSeed.map((it) => ({
      id: it.id,
      name: it.name,
      basePrice: it.basePrice,
      highestBid: it.basePrice,
      highestBidder: null,
      sold: false
    }))
    db.save("items", resetItems)

    // Reset users: balance back to 1000, keep names and ids
    const users = db.load("users").map((u) => ({ id: u.id, name: u.name, balance: 1000, bids: [] }))
    db.save("users", users)

    // Reset auction state to closed
    const state = { auction: { isOpen: false, startTime: null, endTime: null } }
    db.save("auction", state)

    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ message: "error al reiniciar la ronda" })
  }
})

app.get("/users", (req, res) => {
  const users = db.load("users")
  res.status(200).send(users)
})

app.listen(5080, () => {
  console.log("Server is running on http://localhost:5080")
})
