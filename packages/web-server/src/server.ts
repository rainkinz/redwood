#!/usr/bin/env node

import path from 'path'

import chalk from 'chalk'
import { config } from 'dotenv-defaults'
import Fastify from 'fastify'
import yargsParser from 'yargs-parser'

import { getPaths, getConfig } from '@redwoodjs/project-config'

import { redwoodFastifyWeb } from './web'
import { withApiProxy } from './withApiProxy'

interface Opts {
  socket?: string
  port: number
  apiHost?: string
  apiUrl: string
}

function parseOptions(): Opts {
  // Parse server file args
  const args = yargsParser(process.argv.slice(2), {
    string: ['port', 'socket', 'apiHost'],
    alias: { apiHost: ['api-host'], port: ['p'] },
  })

  const redwoodConfig = getConfig()

  const port = args.port ? parseInt(args.port) : redwoodConfig.web.port
  const apiUrl = redwoodConfig.web.apiUrl

  const options: Opts = {
    socket: args.socket,
    port: port,
    apiHost: args.apiHost,
    apiUrl: apiUrl
  }

  const redwoodProjectPaths = getPaths()

  // Load .env files
  config({
    path: path.join(redwoodProjectPaths.base, '.env'),
    defaults: path.join(redwoodProjectPaths.base, '.env.defaults'),
    multiline: true,
  })

  return options
}

export async function serve() {
  const tsServer = Date.now()
  const options = parseOptions()

  console.log(chalk.italic.dim('Starting Web Server...'))

  // Configure Fastify
  const fastify = Fastify({
    requestTimeout: 15_000,
    logger: {
      // Note: If running locally using `yarn rw serve` you may want to adust
      // the default non-development level to `info`
      level:
        process.env.LOG_LEVEL ?? process.env.NODE_ENV === 'development'
          ? 'debug'
          : 'warn',
    },
  })

  await fastify.register(redwoodFastifyWeb, {
    redwood: {
      ...options,
    },
  })

  // TODO: Could this be folded into redwoodFastifyWeb?
  // If apiHost is supplied, it means the functions are running elsewhere, so we should just proxy requests.
  if (options.apiHost) {
    // Attach plugin for proxying
    fastify.register(withApiProxy, { apiHost: options.apiHost, apiUrl: options.apiUrl })
  }

  let listenOptions:
    | { path: string; port?: never; host?: never }
    | { path?: never; port?: number; host?: string }

  if (options.socket) {
    listenOptions = { path: options.socket }
  } else {
    listenOptions = {
      port: options.port,
      host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '::',
    }
  }

  // Start
  fastify.listen(listenOptions).then(() => {
    console.log(chalk.italic.dim('Took ' + (Date.now() - tsServer) + ' ms'))
    if (options.socket) {
      console.log(`Web server started on ${options.socket}`)
    } else {
      console.log(`Web server started on http://localhost:${port}`)
    }
  })

  process.on('exit', () => {
    fastify.close()
  })
}

serve()
