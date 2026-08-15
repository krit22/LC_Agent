import { generateText, isStepCount } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { config } from '../config.js'
import { SYSTEM_PROMPT } from './prompts.js'
import { conversationContext } from './context.js'
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  listPeople,
  getPerson,
  listDomains,
} from './tools/index.js'

const openrouter = createOpenRouter({
  apiKey: config.openrouterApiKey,
})

/**
 * Result from the agent brain after processing a command.
 */
export interface BrainResult {
  /** The agent's text response to send back to WhatsApp */
  responseText: string
  /** Whether the agent successfully processed the request */
  success: boolean
}

/**
 * Process a user command through the AI Agent Brain.
 *
 * 1. Retrieves conversation history for the group
 * 2. Adds the new user message to context
 * 3. Calls generateText() with tools and system prompt
 * 4. Adds the assistant response to context
 * 5. Returns the response text
 */
export async function processCommand(
  groupJid: string,
  commandText: string,
  senderName: string,
): Promise<BrainResult> {
  try {
    // Build message with sender context
    const userMessage = `[${senderName}]: ${commandText}`

    // Add to conversation context
    conversationContext.addUserMessage(groupJid, userMessage)

    // Get full conversation history
    const messages = conversationContext.getHistory(groupJid)

    console.log(`\n🧠 [Agent Brain] Initiating reasoning`)
    console.log(`   Model:   ${config.openrouterModel}`)
    console.log(`   Context: ${messages.length} message(s) in group memory`)
    console.log(`   Prompt:  "${userMessage}"`)

    // Call the LLM with tools
    const result = await generateText({
      model: openrouter(config.openrouterModel),
      system: SYSTEM_PROMPT,
      messages,
      tools: {
        listTasks,
        getTask,
        createTask,
        updateTask,
        listPeople,
        getPerson,
        listDomains,
      },
      stopWhen: isStepCount(5),
      onStepFinish: (step) => {
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const tc of step.toolCalls) {
            console.log(
              `   🔧 [Agent Tool Call] ${tc.toolName}(${JSON.stringify((tc as any).input || (tc as any).args || {})})`,
            )
          }
        }
        if (step.toolResults && step.toolResults.length > 0) {
          for (const tr of step.toolResults) {
            const summary =
              typeof tr.output === 'object'
                ? JSON.stringify(tr.output).slice(0, 200) +
                  (JSON.stringify(tr.output).length > 200 ? '...' : '')
                : String(tr.output)
            console.log(`   📊 [Tool Output] ${tr.toolName} → ${summary}`)
          }
        }
      },
    })

    const responseText =
      result.text || 'I processed the request but have no text to respond with.'

    console.log(`\n💬 [Agent Response Generated]`)
    console.log(`   ${responseText.split('\n').join('\n   ')}`)

    // Add assistant response to context
    conversationContext.addAssistantMessage(groupJid, responseText)

    return { responseText, success: true }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    console.error(`\n❌ [Agent Brain Error] ${errorMessage}`)

    return {
      responseText: `❌ Something went wrong while processing your request. Please try again.\n\nError: ${errorMessage}`,
      success: false,
    }
  }
}
