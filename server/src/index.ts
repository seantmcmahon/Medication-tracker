/**
 * Cloudflare Worker: receives updates from the app, runs a check every minute, and talks to Telegram.
 * All state lives in one Durable Object ("home") so updates and checks never overlap.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  applySync,
  emptyState,
  handleCommand,
  tick,
  type OutgoingMessage,
  type ServerState,
  type SyncPayload,
} from './engine.ts';

export interface Env {
  HOME: DurableObjectNamespace<Home>;
  TELEGRAM_BOT_TOKEN: string;
  /** Shared password between the app and this server. */
  APP_KEY: string;
}

type TelegramUpdate = {
  message?: { chat: { id: number; type: string }; from?: { first_name?: string }; text?: string };
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The invite code and webhook secret are derived from APP_KEY so there are fewer secrets to set up. */
// Spaces at either end of the key are ignored everywhere, since they're easy to paste by mistake.
const appKey = (env: Env) => (env.APP_KEY ?? '').trim();
const joinCode = async (env: Env) => (await sha256(`${appKey(env)}:join`)).slice(0, 16);
const webhookSecret = async (env: Env) => (await sha256(`${appKey(env)}:webhook`)).slice(0, 32);

async function telegram(env: Env, method: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    // Telegram unreachable: report it like a failed request rather than crashing.
    console.error(`Telegram ${method} failed`, e);
    return new Response('{}', { status: 503 });
  }
}

export class Home extends DurableObject<Env> {
  private async load(): Promise<ServerState> {
    return { ...emptyState(), ...((await this.ctx.storage.get<ServerState>('state')) ?? {}) };
  }

  private async save(state: ServerState): Promise<void> {
    await this.ctx.storage.put('state', state);
  }

  private async send(state: ServerState, messages: OutgoingMessage[]): Promise<ServerState> {
    let next = state;
    for (const m of messages) {
      const res = await telegram(this.env, 'sendMessage', { chat_id: m.chatId, text: m.text });
      if (res.status === 403) {
        // They blocked the bot or deleted the chat: stop trying.
        const subscribers = { ...next.subscribers };
        delete subscribers[m.chatId];
        next = { ...next, subscribers };
      } else if (!res.ok) {
        console.error('Telegram sendMessage failed', res.status, await res.text());
      }
    }
    return next;
  }

  async sync(payload: SyncPayload): Promise<{ subscribers: number }> {
    const state = applySync(await this.load(), payload, Date.now());
    await this.save(state);
    return { subscribers: Object.keys(state.subscribers).length };
  }

  async tick(): Promise<void> {
    const before = await this.load();
    const result = tick(before, Date.now());
    if (result.state === before && result.messages.length === 0) return;
    // Save first so a slow or failed send can never cause the same message to go out twice.
    await this.save(result.state);
    if (result.messages.length > 0) await this.save(await this.send(result.state, result.messages));
  }

  async telegramUpdate(update: TelegramUpdate): Promise<void> {
    const msg = update.message;
    if (!msg?.text || msg.chat.type !== 'private') return;
    const { state, reply } = handleCommand(
      await this.load(),
      String(msg.chat.id),
      msg.from?.first_name ?? 'there',
      msg.text,
      await joinCode(this.env),
      Date.now(),
    );
    await this.save(state);
    await this.send(state, [{ chatId: String(msg.chat.id), text: reply }]);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function authorised(request: Request, env: Env): boolean {
  const header = (request.headers.get('authorization') ?? '').trim();
  const expected = `Bearer ${appKey(env)}`;
  if (!appKey(env) || header.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < header.length; i++) diff |= header.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const home = (env: Env) => env.HOME.get(env.HOME.idFromName('home'));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/telegram' && request.method === 'POST') {
      if (request.headers.get('x-telegram-bot-api-secret-token') !== (await webhookSecret(env))) {
        return new Response('Forbidden', { status: 403 });
      }
      await home(env).telegramUpdate((await request.json()) as TelegramUpdate);
      return new Response('OK');
    }

    if (!authorised(request, env)) return json({ error: 'Wrong key' }, 401);

    if (url.pathname === '/sync' && request.method === 'POST') {
      return json(await home(env).sync((await request.json()) as SyncPayload));
    }

    if (url.pathname === '/invite' && request.method === 'GET') {
      const me = (await (await telegram(env, 'getMe', {})).json()) as { result?: { username?: string } };
      if (!me.result?.username) return json({ error: 'Could not reach the Telegram bot. Check TELEGRAM_BOT_TOKEN.' }, 502);
      return json({ link: `https://t.me/${me.result.username}?start=${await joinCode(env)}` });
    }

    // Called by the deploy workflow: points the Telegram bot at this server.
    if (url.pathname === '/admin/setup' && request.method === 'POST') {
      const hook = await telegram(env, 'setWebhook', {
        url: `${url.origin}/telegram`,
        secret_token: await webhookSecret(env),
        allowed_updates: ['message'],
      });
      await telegram(env, 'setMyCommands', {
        commands: [
          { command: 'status', description: 'How things stand right now' },
          { command: 'updates_on', description: 'A message each time a dose is taken' },
          { command: 'updates_off', description: 'Only missed-dose alerts' },
          { command: 'summary_on', description: 'A summary each night' },
          { command: 'summary_off', description: 'No nightly summary' },
          { command: 'stop', description: 'Stop all messages' },
        ],
      });
      return json({ webhook: hook.ok }, hook.ok ? 200 : 502);
    }

    return json({ error: 'Not found' }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await home(env).tick();
  },
} satisfies ExportedHandler<Env>;
