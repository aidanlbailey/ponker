import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'
import { join, newRoom, viewOf, type ChatLine } from '../worker/src/room'

async function chatTable(page: Page) {
  const token = 'chat-browser-player'
  const room = newRoom()
  join(room, token, 'Me', 0)
  let socket: WebSocketRoute
  let at = 0
  let refuseNext = false
  const incoming = (lines: ChatLine[]) => socket.send(JSON.stringify({ t: 'chat', lines }))
  await page.routeWebSocket('**/room/test*', (ws) => {
    socket = ws
    ws.onMessage((raw) => {
      if (raw === 'ping') return ws.send('pong')
      const cmd = JSON.parse(String(raw))
      if (cmd.t !== 'chat') return
      if (refuseNext) {
        refuseNext = false
        return ws.send(JSON.stringify({ t: 'nope', why: 'slow down' }))
      }
      incoming([{ name: 'Me', text: cmd.text, at: ++at, seat: 0 }])
    })
    ws.send(JSON.stringify(viewOf(room, token, new Set([token]), 0)))
    incoming([])
  })
  await page.goto('/#room/test')
  await page.getByRole('textbox', { name: 'What should the table call you?' }).fill('Me')
  await page.getByRole('button', { name: 'Sit down', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Chat and emotes', exact: true })).toBeVisible()
  return {
    incoming: (count: number) => incoming(Array.from({ length: count }, () => ({ name: 'Friend', text: `Hello ${++at}`, at, seat: 3 }))),
    refuse: () => { refuseNext = true },
  }
}

const startTyping = async (page: Page, text: string) => {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await page.keyboard.type(text)
}

test('unread messages keep counting after history fills and ignore own messages and refusals', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Type-to-chat requires a fine pointer')
  const chat = await chatTable(page)
  const toggle = page.getByRole('button', { name: 'Chat and emotes', exact: true })
  const badge = page.locator('.room-unread')
  chat.incoming(30)
  await expect(badge).toHaveText('30')
  await toggle.click()
  await expect(page.locator('.room-chat-line')).toHaveCount(30)
  await page.getByRole('button', { name: 'Close chat', exact: true }).click()
  await expect(badge).toHaveCount(0)

  await startTyping(page, 'My message')
  await page.keyboard.press('Enter')
  await expect(badge).toHaveCount(0)
  chat.incoming(1)
  await expect(badge).toHaveText('1')
  await startTyping(page, 'Another message')
  await page.keyboard.press('Enter')
  await expect(badge).toHaveText('1')
  chat.refuse()
  await startTyping(page, 'Too soon')
  await page.keyboard.press('Enter')
  chat.incoming(1)
  await expect(badge).toHaveText('2')

  await toggle.click()
  chat.incoming(1)
  await expect(page.locator('.room-chat-message').last()).toContainText('Hello')
  await page.getByRole('button', { name: 'Close chat', exact: true }).click()
  await expect(badge).toHaveCount(0)
  chat.incoming(1)
  await expect(badge).toHaveText('1')
})

test('Space activates a focused button while ordinary typing still starts a draft', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Type-to-chat requires a fine pointer')
  await chatTable(page)
  const toggle = page.getByRole('button', { name: 'Chat and emotes', exact: true })
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(page.locator('.room-chat')).toBeVisible()
  await expect(page.locator('.said.draft')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close chat', exact: true }).click()
  await startTyping(page, 'hello')
  await expect(page.locator('.said.draft')).toContainText('hello')
  await page.keyboard.press('Escape')
  await expect(page.locator('.said.draft')).toHaveCount(0)
})

test('the typing caret stays still with reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Type-to-chat requires a fine pointer')
  await chatTable(page)
  await startTyping(page, 'hello')
  const caret = page.locator('.said-caret')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(caret).toHaveCSS('animation-name', 'caret')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(caret).toHaveCSS('animation-name', 'none')
})
