/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   utils.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rrichard <rrichard@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2025/07/30 15:08:11 by rrichard          #+#    #+#             */
/*   Updated: 2025/07/30 15:08:12 by rrichard         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export function getPaddleHeight(canvasHeight: number, min: number, max: number, ratio: number)
{
	return Math.max(min, Math.min(max, canvasHeight * ratio));
}