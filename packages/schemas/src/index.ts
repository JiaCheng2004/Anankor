import { z } from 'zod';

export const jobBaseSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  idempotencyKey: z.string().min(1),
  createdAt: z.coerce.date(),
});

export const playTrackJobSchema = jobBaseSchema.extend({
  type: z.literal('play.track'),
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  track: z.object({
    url: z.string().min(1),
    title: z.string().min(1),
    author: z.string().optional(),
  }),
});

export type JobBase = z.infer<typeof jobBaseSchema>;
export type PlayTrackJob = z.infer<typeof playTrackJobSchema>;

export const jobEnvelopeSchema = z.discriminatedUnion('type', [playTrackJobSchema]);
export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;
