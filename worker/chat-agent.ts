import { createWorkersAI } from "workers-ai-provider";
import { type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs,
  type StreamTextOnFinishCallback,
  type ToolSet,
} from "ai";
import { z } from "zod";

export class ChatAgent extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: `You are a helpful assistant. You can check the weather, get the user's timezone, run calculations, and schedule tasks.

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.`,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
      }),
      tools: {
        getWeather: tool({
          description: "Get the current weather for a city",
          inputSchema: z.object({
            city: z.string().describe("City name"),
          }),
          execute: async ({ city }) => {
            const conditions = ["sunny", "cloudy", "rainy", "snowy"];
            const temp = Math.floor(Math.random() * 30) + 5;
            return {
              city,
              temperature: temp,
              condition:
                conditions[Math.floor(Math.random() * conditions.length)],
              unit: "celsius",
            };
          },
        }),

        getUserTimezone: tool({
          description:
            "Get the user's timezone from their browser. Use this when you need to know the user's local time.",
          inputSchema: z.object({}),
        }),

        calculate: tool({
          description:
            "Perform a math calculation with two numbers. Requires user approval for large numbers.",
          inputSchema: z.object({
            a: z.number().describe("First number"),
            b: z.number().describe("Second number"),
            operator: z
              .enum(["+", "-", "*", "/", "%"])
              .describe("Arithmetic operator"),
          }),
          needsApproval: async ({ a, b }) =>
            Math.abs(a) > 1000 || Math.abs(b) > 1000,
          execute: async ({ a, b, operator }) => {
            const ops: Record<string, (x: number, y: number) => number> = {
              "+": (x, y) => x + y,
              "-": (x, y) => x - y,
              "*": (x, y) => x * y,
              "/": (x, y) => x / y,
              "%": (x, y) => x % y,
            };
            if (operator === "/" && b === 0) {
              return { error: "Division by zero" };
            }
            return {
              expression: `${a} ${operator} ${b}`,
              result: ops[operator](a, b),
            };
          },
        }),

        scheduleTask: tool({
          description:
            "Schedule a task to be executed at a later time. Use this when the user asks to be reminded or wants something done later.",
          inputSchema: scheduleSchema,
          execute: async ({ when, description }) => {
            if (when.type === "no-schedule") {
              return "Not a valid schedule input";
            }
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", description);
              return `Task scheduled: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          },
        }),

        getScheduledTasks: tool({
          description: "List all tasks that have been scheduled",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          },
        }),

        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel"),
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          },
        }),
      },
      onFinish,
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal,
    });

    return result.toUIMessageStreamResponse();
  }

  async executeTask(description: string, _task: Schedule<string>) {
    console.log(`Executing scheduled task: ${description}`);

    this.broadcast(
      JSON.stringify({
        type: "scheduled-task",
        description,
        timestamp: new Date().toISOString(),
      })
    );
  }
}
