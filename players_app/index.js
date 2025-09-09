const tableBody = document.querySelector('#items-table tbody')
const meEl = document.getElementById('me')
const loginBtn = document.getElementById('login-btn')
const registerBtn = document.getElementById('register-btn')
const playerName = document.getElementById('player-name')
const msgEl = document.getElementById('msg')

let me = null
let pollId = null

loginBtn.addEventListener('click', () => loginOrRegister(false))
registerBtn.addEventListener('click', () => loginOrRegister(true))

async function loginOrRegister(forceRegister = false) {
  const name = (playerName.value || '').trim()
  if (!name) { showMsg('Ingresa un nombre', true); return }
  try {
    if (forceRegister) {
      // Force register new user
      const regRes = await fetch('/users/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      })
      const data = await regRes.json()
      if (!regRes.ok) { showMsg(data.message || 'No se pudo registrar', true); return }
      me = data
      meEl.textContent = `Hola, ${me.name}. Balance disp.: ${me.availableBalance ?? me.balance}`
      showMsg('Registrado y conectado')
      startPolling()
    } else {
      // Try login by name first
      const loginRes = await fetch(`/users/by-name?name=${encodeURIComponent(name)}`)
      if (loginRes.ok) {
        me = await loginRes.json()
        meEl.textContent = `Hola, ${me.name}. Balance disp.: ${me.availableBalance ?? me.balance}`
        showMsg('Sesión iniciada')
        startPolling()
        return
      }

      showMsg('Usuario no encontrado. Usa "Registrar" para crear una cuenta nueva.', true)
    }
  } catch (e) { console.error(e) }
}

function startPolling() {
  if (pollId) clearInterval(pollId)
  pollId = setInterval(loadItems, 1000)
  loadItems()
}

async function loadItems() {
  try {
    const active = document.activeElement
    const userTyping = active && active.tagName === 'INPUT' && active.id.startsWith('bid-')
    if (userTyping) return

    const res = await fetch('/items?sort=highestBid')
    const items = await res.json()
    tableBody.innerHTML = items.map(renderRow).join('')
    await maybeNotifyAuctionClosed(items)
    if (me) { await refreshUser() }
  } catch (e) { console.error(e) }
}

function renderRow(i) {
  const myLeader = me && (i.highestBidder === me.id || i.highestBidderName === me?.name)
  return `<tr>
    <td>${i.id}</td>
    <td>${i.name}</td>
    <td>${i.highestBid}</td>
    <td>${i.highestBidderName ?? '-'}</td>
    <td>${myLeader ? i.highestBid : '-'}</td>
    <td>${renderBidControls(i)}</td>
  </tr>`
}

function renderBidControls(i) {
  return `<input type="number" id="bid-${i.id}" min="0" style="width:90px" />
    <button onclick="placeBid(${i.id})">Pujar</button>`
}

window.placeBid = async function(id) {
  if (!me) { alert('Regístrate primero'); return }
  const input = document.getElementById(`bid-${id}`)
  const amount = Number(input.value)
  if (!Number.isFinite(amount)) { showMsg('monto inválido', true); return }
  if (me && typeof me.availableBalance === 'number' && amount > me.availableBalance) {
    showMsg('saldo insuficiente', true)
    return
  }
  try {
    const res = await fetch(`/items/${id}/bid`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: me.id, amount })
    })
    const data = await res.json()
    if (!res.ok) {
      if (data && typeof data.currentHighest === 'number') {
        showMsg(`${data.message}. Actual: ${data.currentHighest}. Puja al menos ${data.minRequired}.`, true)
      } else {
        showMsg(data.message || 'Error al pujar', true)
      }
      return
    }
    showMsg('puja aceptada')

    if (typeof data.availableBalance === 'number') {
      me.availableBalance = data.availableBalance
    }
    await refreshUser()
    await loadItems()
  } catch (e) { console.error(e) }
}

async function refreshUser() {
  if (!me) return
  const res = await fetch(`/users/${me.id}`)
  if (res.ok) me = await res.json()
  meEl.textContent = `Hola, ${me.name}. Balance disp.: ${me.availableBalance ?? me.balance}`
}

loadItems()

function showMsg(text, isError = false) {
  if (!msgEl) return
  msgEl.textContent = text
  msgEl.classList.remove('msg--ok', 'msg--error')
  msgEl.classList.add(isError ? 'msg--error' : 'msg--ok')
}

let notifiedClose = false
async function maybeNotifyAuctionClosed(items) {
  try {
    const stateRes = await fetch('/auction/state')
    const state = await stateRes.json()
    if (state && state.auction && state.auction.isOpen === false) {
      if (!notifiedClose) {
        notifiedClose = true
        const won = (items || []).filter((it) => me && it.sold && it.highestBidderName === me.name)
        if (won.length > 0) {
          const names = won.map((w) => `${w.name} (${w.highestBid})`).join(', ')
          showMsg(`Subasta finalizada. Ganaste: ${names}`)
        } else {
          showMsg('Subasta finalizada. No ganaste ítems')
        }
      }
    } else {
      notifiedClose = false
    }
  } catch (_) {}
}
