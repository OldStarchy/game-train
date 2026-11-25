Feature: Game night
  A host runs a game show from one device. Players join on their phones by
  game code, the host lets them in, and everything after that happens over
  Realtime.

  Background:
    Given a host has created a game called "E2E night"
    And "Alice" and "Bob" have asked to join
    When the host lets everyone in
    Then "Alice" and "Bob" are in the game
    And everyone is connected

  Scenario: The earliest buzz wins and the score reaches every player
    When the host shows a buzzer
    And "Alice" buzzes
    And "Bob" buzzes
    Then the host sees that "Alice" buzzed first
    And "Alice"'s buzzer says "You're first!"
    And "Bob"'s buzzer says "Too slow"
    When the host marks "Alice" correct
    And the host clears the screens
    Then every player sees that "Alice" has 1 point

  Scenario: Answers to a question are private to each player
    When the host asks "Name a famous horse"
    And "Alice" answers "Phar Lap"
    And "Bob" answers "Black Beauty"
    Then the host sees the answer "Phar Lap"
    And the host sees the answer "Black Beauty"
    But "Alice" cannot see the answer "Black Beauty"

  Scenario: A kicked player is removed from the game
    When the host kicks "Bob"
    Then "Bob" is told they have been removed
    And "Bob" is no longer in the host's player list
