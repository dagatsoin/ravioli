import { array, number, object, string } from '../src'
import { getNode } from '../src/helpers'
import * as STManager from '../src/STManager'

const Player = object({
  name: string(),
  inventory: array(
    object({
      id: string(),
      count: number(),
    })
  ),
})

let player: typeof Player.Type

beforeEach(function() {
  player = Player.create()
})

it('should have patch after an Arr.splice', function() {
  STManager.transaction(() => {
    player.inventory = player.inventory.splice(0, 1)
    expect(getNode(player).$patch.length > 0)
  })
  expect(getNode(player).$patch.length === 0)
})
