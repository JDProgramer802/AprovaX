import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';

// Configuración del logger
const logger = pino({ level: 'silent' });

// Estado de procesos activos por grupo
const activeProcesses = new Map();

let sock;

/**
 * Formatea un mensaje con el estilo de WhatsApp
 */
function formatMessage(text) {
  return text;
}

/**
 * Baraja un array aleatoriamente (algoritmo Fisher-Yates)
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Inicia la conexión del bot
 */
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: state,
    getMessage: async () => undefined
  });

  // Manejo de credenciales
  sock.ev.on('creds.update', saveCreds);

  // Manejo de conexión
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[TERMINAL] ⏳ Generando QR de autenticación...');
      console.log('[TERMINAL] 🎯 Escanea el QR con WhatsApp desde tu teléfono.\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('\n[TERMINAL] ❌ Conexión cerrada. Reconectando:', shouldReconnect);
      
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('[TERMINAL] ✅ QR escaneado correctamente.');
      console.log('[TERMINAL] 🔗 Conexión establecida.\n');
    }
  });

  // Manejo de mensajes
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const messageText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
    const chatId = msg.key.remoteJid;
    const isGroup = chatId.endsWith('@g.us');

    // Solo procesar comandos $approve en grupos
    if (messageText.startsWith('$approve') && isGroup) {
      await handleApproveCommand(msg, messageText, chatId);
    }

    // Comando $ping (funciona en grupos y chats privados)
    if (messageText.startsWith('$ping')) {
      await handlePingCommand(chatId);
    }

    // Comando $menu (funciona en grupos y chats privados)
    if (messageText.startsWith('$menu')) {
      await handleMenuCommand(chatId, isGroup);
    }
  });
}

/**
 * Maneja el comando $menu
 */
async function handleMenuCommand(chatId, isGroup) {
  const menuText = (
    `╭───────────────────────────────╮\n` +
    `│                                │\n` +
    `│    💠 *APROVAX BOT* 💠    │\n` +
    `│    _Menú de Comandos_     │\n` +
    `│                                │\n` +
    `╰───────────────────────────────╯\n\n` +
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
    `┃  🤖 *COMANDOS GENERALES*  ┃\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
    `• ⚔︎ *$ping*\n` +
    `  ├─ Verifica la latencia del bot\n` +
    `  └─ 📝 \`$ping\`\n\n` +
    `• 📋 *$menu*\n` +
    `  ├─ Muestra este menú\n` +
    `  └─ 📝 \`$menu\`\n\n`
  );

  const approveSection = isGroup ? (
    `┏━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n` +
    `┃  👥 *COMANDOS DE GRUPO*   ┃\n` +
    `┗━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n` +
    `• ✅ *$approve* \`<total> <lote> <orden>\`\n` +
    `  └─ Aprueba solicitudes de unión\n\n` +
    `  📊 *Parámetros:*\n` +
    `  ├─ \`total\` → Cantidad a aprobar\n` +
    `  ├─ \`lote\` → Solicitudes por lote\n` +
    `  └─ \`orden\` → Tipo de ordenamiento\n\n` +
    `  🎲 *Órdenes:*\n` +
    `  ├─ 🎲 \`random\` - Aleatorio\n` +
    `  ├─ 🆕 \`recientes\` - Nuevos primero\n` +
    `  └─ ⏳ \`antiguas\` - Antiguos primero\n\n` +
    `  💡 *Ejemplos:*\n` +
    `  ├─ 📝 \`$approve 30 5 random\`\n` +
    `  ├─ 📝 \`$approve 50 10 recientes\`\n` +
    `  └─ 📝 \`$approve 20 5 antiguas\`\n\n`
  ) : '';

  const footer = (
    `────────────────────────────────\n` +
    `✧˖°. *AprovaX Bot v1.0* 💠\n` +
    `👨‍💻 _Desarrollado por Andres_\n` +
    `✨ _Bot de gestión de grupos_`
  );

  await sock.sendMessage(chatId, {
    text: menuText + approveSection + footer
  });
}

/**
 * Maneja el comando $ping
 */
async function handlePingCommand(chatId) {
  const startTime = Date.now();
  
  // Enviar mensaje inicial
  const sentMsg = await sock.sendMessage(chatId, {
    text: '⚔︎ _Calculando latencia..._'
  });
  
  // Calcular latencia
  const endTime = Date.now();
  const latency = endTime - startTime;
  
  // Editar el mensaje con la latencia
  await sock.sendMessage(chatId, {
    text: (
      `⚔︎ _¡Pong!_\n` +
      `> _Latencia_ _ⴵ ${latency}ms_\n` +
      `> _AprovaX Operativo_ ✧˖°.💠\n\n` +
      `_Desarrollado por Andres 💠_`
    ),
    edit: sentMsg.key
  });
}

/**
 * Maneja el comando $approve
 */
async function handleApproveCommand(msg, messageText, chatId) {
  const parts = messageText.split(' ');
  
  if (parts.length !== 4) {
    await sock.sendMessage(chatId, {
      text: formatMessage(
        `⚠️ *Uso incorrecto del comando*\n` +
        `📝 _Formato correcto:_ \`$approve <total> <lote> <orden>\`\n\n` +
        `📋 *Órdenes disponibles:*\n` +
        `• \`random\` - Orden aleatorio\n` +
        `• \`recientes\` - Más recientes primero\n` +
        `• \`antiguas\` - Más antiguas primero\n\n` +
        `_Ejemplo:_ \`$approve 30 5 random\`\n\n` +
        `_Desarrollado por Andres 💠_`
      )
    });
    return;
  }

  const total = parseInt(parts[1]);
  const loteSize = parseInt(parts[2]);
  const orden = parts[3].toLowerCase();

  if (isNaN(total) || isNaN(loteSize) || total <= 0 || loteSize <= 0) {
    await sock.sendMessage(chatId, {
      text: formatMessage(
        `⚠️ *Parámetros inválidos*\n` +
        `❌ _Los valores deben ser números positivos_\n\n` +
        `_Desarrollado por Andres 💠_`
      )
    });
    return;
  }

  // Validar orden
  const ordenesValidos = ['random', 'recientes', 'antiguas'];
  if (!ordenesValidos.includes(orden)) {
    await sock.sendMessage(chatId, {
      text: formatMessage(
        `⚠️ *Orden inválido*\n` +
        `❌ _Usa:_ \`random\`, \`recientes\` o \`antiguas\`\n\n` +
        `_Desarrollado por Andres 💠_`
      )
    });
    return;
  }

  // Verificar si ya hay un proceso activo en este grupo
  if (activeProcesses.has(chatId)) {
    await sock.sendMessage(chatId, {
      text: formatMessage(
        `⚠️ *Ya hay un proceso en ejecución*\n` +
        `⏳ _Espera a que termine el proceso actual_\n\n` +
        `_Desarrollado por Andres 💠_`
      )
    });
    return;
  }

  // Marcar proceso como activo
  activeProcesses.set(chatId, true);

  // Mensaje inicial
  const ordenEmoji = {
    'random': '🎲',
    'recientes': '🆕',
    'antiguas': '⏳'
  };

  await sock.sendMessage(chatId, {
    text: formatMessage(
      `⏳ *Iniciando aprobación*\n` +
      `🎯 _Objetivo:_ \`${total}\`\n` +
      `📦 _Lote:_ \`${loteSize}\`\n` +
      `${ordenEmoji[orden]} _Orden:_ \`${orden}\`\n` +
      `⏱️ _Delay:_ \`3000 ms\`\n\n` +
      `_Desarrollado por Andres 💠_`
    )
  });

  try {
    // Obtener información del grupo
    const groupMetadata = await sock.groupMetadata(chatId);
    
    // Obtener solicitudes pendientes
    const participantRequests = await sock.groupRequestParticipantsList(chatId);
    
    if (!participantRequests || participantRequests.length === 0) {
      await sock.sendMessage(chatId, {
        text: formatMessage(
          `ℹ️ *No hay solicitudes pendientes en este grupo*\n` +
          `_Todo está al día 😎_\n\n` +
          `_Desarrollado por Andres 💠_`
        )
      });
      activeProcesses.delete(chatId);
      return;
    }

    // Mensaje de conexión autorizada
    await sock.sendMessage(chatId, {
      text: formatMessage(
        `🔗 *Conexión autorizada correctamente*\n` +
        `✅ _Sesión activa. Procediendo con la aprobación solicitada._`
      )
    });

    // Procesar aprobaciones
    await processApprovals(chatId, participantRequests, total, loteSize, orden);

  } catch (error) {
    console.error('[ERROR]', error);
    await sock.sendMessage(chatId, {
      text: formatMessage(
        `⚠️ *Error durante la aprobación*\n` +
        `❌ _Solicitudes procesadas:_ \`0/${total}\`\n` +
        `🧩 _Detalles:_ \`${error.message}\`\n\n` +
        `_Desarrollado por Andres 💠_`
      )
    });
  } finally {
    activeProcesses.delete(chatId);
  }
}

/**
 * Procesa las aprobaciones en lotes
 */
async function processApprovals(chatId, requests, total, loteSize, orden) {
  const startTime = Date.now();
  let processed = 0;
  const totalLotes = Math.ceil(Math.min(total, requests.length) / loteSize);
  let currentLote = 0;

  // Ordenar solicitudes según el parámetro
  let orderedRequests;
  
  if (orden === 'random') {
    orderedRequests = shuffleArray(requests);
    console.log(`[INFO] Solicitudes en orden aleatorio: ${requests.length} solicitudes`);
  } else if (orden === 'recientes') {
    orderedRequests = [...requests].reverse(); // Las más recientes primero
    console.log(`[INFO] Solicitudes ordenadas por más recientes: ${requests.length} solicitudes`);
  } else if (orden === 'antiguas') {
    orderedRequests = [...requests]; // Las más antiguas primero (orden original)
    console.log(`[INFO] Solicitudes ordenadas por más antiguas: ${requests.length} solicitudes`);
  }
  
  const requestsToProcess = orderedRequests.slice(0, total);

  try {
    for (let i = 0; i < requestsToProcess.length; i += loteSize) {
      currentLote++;
      const batch = requestsToProcess.slice(i, i + loteSize);
      const batchSize = batch.length;

      // Mensaje de progreso
      await sock.sendMessage(chatId, {
        text: formatMessage(
          `⚙️ *Procesando lote* \`${currentLote}/${totalLotes}\`\n` +
          `👥 _Aceptando_ \`${batchSize}\` _solicitudes..._`
        )
      });

      // Aprobar todas las solicitudes del lote de una sola vez
      try {
        const jidsToApprove = batch.map(request => request.jid);
        await sock.groupRequestParticipantsUpdate(
          chatId,
          jidsToApprove,
          'approve'
        );
        processed += batchSize;
        console.log(`[INFO] Lote ${currentLote} aprobado: ${batchSize} solicitudes`);
      } catch (err) {
        console.error(`[ERROR] No se pudo aprobar el lote ${currentLote}:`, err.message);
        // Intentar aprobar uno por uno si falla el lote completo
        for (const request of batch) {
          try {
            await sock.groupRequestParticipantsUpdate(
              chatId,
              [request.jid],
              'approve'
            );
            processed++;
          } catch (individualErr) {
            console.error(`[ERROR] No se pudo aprobar ${request.jid}:`, individualErr.message);
          }
        }
      }

      // Delay entre lotes (excepto en el último)
      if (i + loteSize < requestsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // Calcular tiempo total
    const endTime = Date.now();
    const totalSeconds = Math.round((endTime - startTime) / 1000);

    // Mensaje de finalización
    await sock.sendMessage(chatId, {
      text: formatMessage(
        `✅ *Aprobación completada exitosamente*\n` +
        `👥 _Solicitudes aceptadas:_ \`${processed}\`\n` +
        `📦 _Lotes procesados:_ \`${totalLotes} de ${loteSize}\`\n` +
        `🕒 _Tiempo total:_ \`${totalSeconds} segundos\`\n\n` +
        `_Desarrollado por Andres 💠_`
      )
    });

  } catch (error) {
    throw error;
  }
}

/**
 * Función para esperar (delay)
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Iniciar el bot
console.log('╔════════════════════════════════════════╗');
console.log('║     🤖 AprovaX Bot - WhatsApp         ║');
console.log('║     Desarrollado por Andres 💠        ║');
console.log('╚════════════════════════════════════════╝\n');

connectToWhatsApp().catch(err => {
  console.error('[ERROR FATAL]', err);
  process.exit(1);
});