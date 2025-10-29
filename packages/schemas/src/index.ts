import { z } from 'zod';

export const jobBaseSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  idempotencyKey: z.string().min(1),
  createdAt: z.coerce.date(),
  sessionKey: z.string().min(3).optional(),
  targetWorkerId: z.string().min(1).optional(),
  queueEntryId: z.string().min(1).optional(),
  queuePosition: z.number().int().min(1).optional(),
});

const commandSourceSchema = z.enum(['interaction', 'prefix']);

const commandRequesterSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
});

const guildCommandJobBaseSchema = jobBaseSchema.extend({
  guildId: z.string().min(1),
  textChannelId: z.string().min(1),
  requester: commandRequesterSchema,
  source: commandSourceSchema,
  locale: z.string().optional(),
  voiceChannelId: z.string().min(1).optional(),
});

export const musicPlayJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.play'),
  voiceChannelId: z.string().min(1),
  query: z.string().min(1),
});

export const musicSkipJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.skip'),
  voiceChannelId: z.string().min(1),
  count: z.number().int().min(1).max(25).optional(),
  force: z.boolean().optional(),
});

export const musicPauseJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.pause'),
  voiceChannelId: z.string().min(1),
});

export const musicResumeJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.resume'),
  voiceChannelId: z.string().min(1),
});

export const musicStopJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.stop'),
  voiceChannelId: z.string().min(1),
  clearQueue: z.boolean().default(true),
});

export const musicQueueJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.queue'),
  voiceChannelId: z.string().min(1),
  page: z.number().int().min(1).optional(),
});

export const musicVolumeJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.volume'),
  voiceChannelId: z.string().min(1),
  level: z.number().int().min(0).max(200).optional(),
});

export const musicFavoriteAddJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.favorite.add'),
  voiceChannelId: z.string().min(1).optional(),
  trackId: z.string().optional(),
});

export const musicFavoritePlayJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.favorite.play'),
  voiceChannelId: z.string().min(1),
  name: z.string().optional(),
});

export const musicPlaylistCreateJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.playlist.create'),
  name: z.string().min(1),
  visibility: z.enum(['personal', 'guild']).default('personal'),
});

export const musicPlaylistAddJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.playlist.add'),
  name: z.string().min(1),
  voiceChannelId: z.string().min(1).optional(),
  query: z.string().optional(),
});

export const musicPlaylistListJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.playlist.list'),
  name: z.string().optional(),
});

export const musicPlaylistPlayJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('music.playlist.play'),
  name: z.string().min(1),
  voiceChannelId: z.string().min(1),
});

export const radioStartJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('radio.start'),
  voiceChannelId: z.string().min(1),
  genre: z.string().min(1),
});

export const radioStopJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('radio.stop'),
  voiceChannelId: z.string().min(1),
});

export const radioGenreListJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('radio.genre.list'),
});

export const gameTurtleStartJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.turtle.start'),
  prompt: z.string().optional(),
});

export const gameTurtleHintJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.turtle.hint'),
  request: z.string().optional(),
});

export const gameTurtleSummaryJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.turtle.summary'),
  summary: z.string().optional(),
});

export const gameWerewolfSetupJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.werewolf.setup'),
  preset: z.string().optional(),
  playerCount: z.number().int().min(5).max(30).optional(),
});

export const gameWerewolfStartJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.werewolf.start'),
});

export const gameWerewolfVoteJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.werewolf.vote'),
  targetUserId: z.string().optional(),
  targetName: z.string().optional(),
});

export const gameWerewolfStatusJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.werewolf.status'),
});

export const gameUndercoverStartJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.undercover.start'),
  wordSet: z.string().optional(),
});

export const gameUndercoverVoteJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.undercover.vote'),
  targetUserId: z.string().optional(),
  targetName: z.string().optional(),
});

export const gameUndercoverStatusJobSchema = guildCommandJobBaseSchema.extend({
  type: z.literal('game.undercover.status'),
});

export const pingRespondJobSchema = jobBaseSchema.extend({
  type: z.literal('ping.respond'),
  guildId: z.string().min(1),
  channelId: z.string().min(1),
  requester: commandRequesterSchema,
});

export type JobBase = z.infer<typeof jobBaseSchema>;
export type CommandSource = z.infer<typeof commandSourceSchema>;
export type CommandRequester = z.infer<typeof commandRequesterSchema>;
export type GuildCommandJobBase = z.infer<typeof guildCommandJobBaseSchema>;
export type MusicPlayJob = z.infer<typeof musicPlayJobSchema>;
export type MusicSkipJob = z.infer<typeof musicSkipJobSchema>;
export type MusicPauseJob = z.infer<typeof musicPauseJobSchema>;
export type MusicResumeJob = z.infer<typeof musicResumeJobSchema>;
export type MusicStopJob = z.infer<typeof musicStopJobSchema>;
export type MusicQueueJob = z.infer<typeof musicQueueJobSchema>;
export type MusicVolumeJob = z.infer<typeof musicVolumeJobSchema>;
export type MusicFavoriteAddJob = z.infer<typeof musicFavoriteAddJobSchema>;
export type MusicFavoritePlayJob = z.infer<typeof musicFavoritePlayJobSchema>;
export type MusicPlaylistCreateJob = z.infer<typeof musicPlaylistCreateJobSchema>;
export type MusicPlaylistAddJob = z.infer<typeof musicPlaylistAddJobSchema>;
export type MusicPlaylistListJob = z.infer<typeof musicPlaylistListJobSchema>;
export type MusicPlaylistPlayJob = z.infer<typeof musicPlaylistPlayJobSchema>;
export type RadioStartJob = z.infer<typeof radioStartJobSchema>;
export type RadioStopJob = z.infer<typeof radioStopJobSchema>;
export type RadioGenreListJob = z.infer<typeof radioGenreListJobSchema>;
export type GameTurtleStartJob = z.infer<typeof gameTurtleStartJobSchema>;
export type GameTurtleHintJob = z.infer<typeof gameTurtleHintJobSchema>;
export type GameTurtleSummaryJob = z.infer<typeof gameTurtleSummaryJobSchema>;
export type GameWerewolfSetupJob = z.infer<typeof gameWerewolfSetupJobSchema>;
export type GameWerewolfStartJob = z.infer<typeof gameWerewolfStartJobSchema>;
export type GameWerewolfVoteJob = z.infer<typeof gameWerewolfVoteJobSchema>;
export type GameWerewolfStatusJob = z.infer<typeof gameWerewolfStatusJobSchema>;
export type GameUndercoverStartJob = z.infer<typeof gameUndercoverStartJobSchema>;
export type GameUndercoverVoteJob = z.infer<typeof gameUndercoverVoteJobSchema>;
export type GameUndercoverStatusJob = z.infer<typeof gameUndercoverStatusJobSchema>;
export type PingRespondJob = z.infer<typeof pingRespondJobSchema>;

export const jobEnvelopeSchema = z.discriminatedUnion('type', [
  pingRespondJobSchema,
  musicPlayJobSchema,
  musicSkipJobSchema,
  musicPauseJobSchema,
  musicResumeJobSchema,
  musicStopJobSchema,
  musicQueueJobSchema,
  musicVolumeJobSchema,
  musicFavoriteAddJobSchema,
  musicFavoritePlayJobSchema,
  musicPlaylistCreateJobSchema,
  musicPlaylistAddJobSchema,
  musicPlaylistListJobSchema,
  musicPlaylistPlayJobSchema,
  radioStartJobSchema,
  radioStopJobSchema,
  radioGenreListJobSchema,
  gameTurtleStartJobSchema,
  gameTurtleHintJobSchema,
  gameTurtleSummaryJobSchema,
  gameWerewolfSetupJobSchema,
  gameWerewolfStartJobSchema,
  gameWerewolfVoteJobSchema,
  gameWerewolfStatusJobSchema,
  gameUndercoverStartJobSchema,
  gameUndercoverVoteJobSchema,
  gameUndercoverStatusJobSchema,
]);

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;
