import React from 'react'
import { Text } from 'react-native'
import { StyleProps } from 'react-native-reanimated'

export type MovingTextProps = {
	text: string
	animationThreshold: number
	style?: StyleProps
}

export const MovingText = React.memo(({ text, style }: MovingTextProps) => {
	return (
		<Text numberOfLines={1} style={style}>
			{text}
		</Text>
	)
})
