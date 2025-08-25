/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pongNetwork.ts                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/08/18 16:44:33 by rrichard          #+#    #+#             */
/*   Updated: 2025/08/18 17:43:08 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type ControlSide = 'left' | 'right' | 'both';
export type NetMode = 'local' | 'host' | 'guest';

export type GuestInput = { up: boolean; down: boolean };

export type Snapshot = {
	ball: { x: number; y: number };
	paddles: { leftY: number; rightY: number };
	scores:  { left: number; right: number };
};

export interface PongNetOpts
{
	control: 'left' | 'right' | 'both';
	netMode: 'local' | 'host' | 'guest';
	ai?: 'left' | 'right' | null;
	emitState?: (state: Snapshot) => void;
	onRemoteInput?: (register: (input: GuestInput) => void) => void;
	applyState?: (register: (state: Snapshot) => void) => void;
}

export function setupRemoteInput(opts: { onInput: (input: GuestInput) => void }, onRemoteInput?: PongNetOpts['onRemoteInput'])
{
	if (onRemoteInput)
		onRemoteInput(opts.onInput);
}

export function getGameOptions(opts: Partial<PongNetOpts>)
{
	const control: ControlSide = opts.control ?? 'both';
	const netMode: NetMode = opts.netMode ?? 'local';
	let aiSide: 'left' | 'right' | null = null;
	if (opts.ai !== undefined)
		aiSide = opts.ai;
	else if (netMode === 'local' && localStorage.getItem('game.inProgress') === 'local-ai')
		aiSide = localStorage.getItem('game.ai') as 'left' | 'right' | null;
	const emitState = opts.emitState;
	return ( { control, netMode, aiSide, emitState} );
}