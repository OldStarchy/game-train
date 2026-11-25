import { z } from 'zod';

/**
 * Widgets: the UI primitives a host can put on a device (docs/design.md,
 * "Concepts"). A *spec* is what the host authors; a *view* is what one device
 * is sent, which adds that device's own state (its answer, whether it won the
 * buzz) and never contains other devices' answers.
 */

const text = (max: number) => z.string().max(max);

export const COLORS = [
	'red',
	'orange',
	'yellow',
	'green',
	'blue',
	'purple',
	'pink',
	'white',
] as const;
export const ColorSchema = z.enum(COLORS);
export type Color = z.infer<typeof ColorSchema>;

export const WidgetSpecSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('text'), title: text(80).optional(), body: text(500) }),
	z.object({ kind: z.literal('buzzer'), label: text(80).optional() }),
	z.object({
		kind: z.literal('text-input'),
		prompt: text(300),
		maxLength: z.number().int().min(1).max(280).default(140),
	}),
	z.object({
		kind: z.literal('choice'),
		prompt: text(300),
		options: z.array(text(80).min(1)).min(2).max(8),
	}),
	z.object({
		kind: z.literal('flash'),
		color: ColorSchema,
		pattern: z.enum(['solid', 'pulse', 'strobe']),
		label: text(80).optional(),
	}),
]);
export type WidgetSpec = z.infer<typeof WidgetSpecSchema>;
export type WidgetKind = WidgetSpec['kind'];

/** One device's state for the widget it's showing. */
export const WidgetStateSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal('none') }),
	z.object({
		kind: z.literal('buzzer'),
		/** armed: can buzz; pressed: buzzed, waiting; won / lost: judged; locked: host closed it. */
		status: z.enum(['armed', 'pressed', 'won', 'lost', 'locked']),
	}),
	z.object({ kind: z.literal('text-input'), submitted: text(280).nullable(), locked: z.boolean() }),
	z.object({
		kind: z.literal('choice'),
		selected: z.number().int().min(0).max(7).nullable(),
		locked: z.boolean(),
	}),
]);
export type WidgetState = z.infer<typeof WidgetStateSchema>;

/** Identifies one push of a widget, so late inputs for an old prompt are ignored. */
export const PromptIdSchema = z.number().int().nonnegative();

/** What a device sends back. */
export const WidgetInputSchema = z.discriminatedUnion('kind', [
	/** `at`: the device's best estimate of host time when pressed (calibrated clock). */
	z.object({ kind: z.literal('buzz'), at: z.number().nonnegative() }),
	z.object({ kind: z.literal('text'), value: text(280) }),
	z.object({ kind: z.literal('choice'), index: z.number().int().min(0).max(7) }),
]);
export type WidgetInput = z.infer<typeof WidgetInputSchema>;
