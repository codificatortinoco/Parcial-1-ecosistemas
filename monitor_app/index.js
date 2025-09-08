const tableBody = document.querySelector('#items-table tbody')
const openBtn = document.getElementById('open-auction')
const closeBtn = document.getElementById('close-auction')
const resetBtn = document.getElementById('reset-round')
const countdownEl = document.getElementById('countdown')
const msgEl = document.getElementById('msg')
const resultsEl = document.getElementById('results')

let intervalId = null
let remaining = 60

async function loadItems() {
  try {
    const res = await fetch('/items?sort=highestBid')
    const items = await res.json()
    tableBody.innerHTML = items
      .map(
        (i) => `<tr><td>${i.id}</td><td>${i.name}</td><td>${i.highestBid}</td><td>${i.highestBidder ?? '-'}</td><td>${i.sold ? '✅' : ''}</td></tr>`
      )
      .join('')
  } catch (e) {
    showMsg('error al obtener los items', true)
  }
}

async function openAuction() {
  try {
    const res = await fetch('/auction/openAll', { method: 'POST' })
    if (!res.ok) {
      const err = await res.json()
      showMsg(err.message || 'no se pudo abrir la subasta', true)
      return
    }
    showMsg('subasta abierta')
    remaining = 60
    startCountdown()
  } catch (e) {
    showMsg('no se pudo abrir la subasta', true)
  }
}

async function closeAuction() {
  try {
    const res = await fetch('/auction/closeAll', { method: 'POST' })
    const data = await res.json()
    stopCountdown()
    await loadItems()
    
    if (!res.ok) {
      showMsg(data.message || 'no se pudo cerrar la subasta', true)
    } else {
      displayAuctionResults(data)
      showMsg('subasta cerrada')
    }
  } catch (e) {
    showMsg('no se pudo cerrar la subasta', true)
  }
}

function startCountdown() {
  stopCountdown()
  intervalId = setInterval(async () => {
    countdownEl.textContent = `${remaining}s`
    if (remaining <= 0) {
      await closeAuction()
      return
    }
    remaining -= 1
    loadItems()
  }, 1000)
}

function stopCountdown() {
  if (intervalId) clearInterval(intervalId)
  intervalId = null
}

openBtn.addEventListener('click', openAuction)
closeBtn.addEventListener('click', closeAuction)
resetBtn.addEventListener('click', resetRound)

// initial
loadItems()

function showMsg(text, isError = false) {
  if (!msgEl) return
  msgEl.textContent = text
  msgEl.classList.remove('msg--ok', 'msg--error')
  msgEl.classList.add(isError ? 'msg--error' : 'msg--ok')
}

async function resetRound() {
  try {
    const res = await fetch('/auction/resetRound', { method: 'POST' })
    if (!res.ok) {
      const e = await res.json()
      showMsg(e.message || 'No se pudo iniciar nueva ronda', true)
      return
    }
    remaining = 60
    resultsEl.classList.add('hidden')
    await loadItems()
    showMsg('Ronda reiniciada. Abre la subasta cuando estés listo.')
  } catch (e) {
    showMsg('No se pudo iniciar nueva ronda', true)
  }
}

function displayAuctionResults(data) {
  resultsEl.classList.remove('hidden')
  
  if (!data.results || data.results.length === 0) {
    resultsEl.innerHTML = '<div class="no-results">No se vendieron ítems en esta ronda.</div>'
    return
  }
  
  let html = '<div class="results-header">🏆 Resultados de la Subasta</div>'
  html += '<div class="results-list">'
  
  data.results.forEach(result => {
    html += `
      <div class="result-item">
        <div class="item-info">
          <span class="item-name">${result.item}</span>
          <span class="item-id">#${result.itemId}</span>
        </div>
        <div class="winner-info">
          <span class="winner-label">Ganador:</span>
          <span class="winner-name">${result.winner}</span>
        </div>
        <div class="bid-info">
          <span class="bid-amount">$${result.finalBid}</span>
        </div>
      </div>
    `
  })
  
  html += '</div>'
  resultsEl.innerHTML = html
  
  console.log('Auction Results:', data)
}
