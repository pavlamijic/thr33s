// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Thr33sLeaderboard {
    struct Entry {
        address player;
        uint256 score;
        uint256 highestTile;
        uint256 timestamp;
    }

    // Maximum number of entries to keep in the leaderboard
    uint256 public constant MAX_SIZE = 100;

    // The leaderboard entries, sorted by score descending
    Entry[] public leaderboard;

    // Personal best scores for each player
    mapping(address => uint256) public personalBest;

    // Events
    event ScoreSubmitted(
        address indexed player,
        uint256 score,
        uint256 highestTile,
        uint256 rank
    );

    // Submit a score to the leaderboard
    function submitScore(uint256 score, uint256 highestTile) external {
        require(score > 0, "Score must be greater than 0");
        require(highestTile >= 3, "Highest tile must be at least 3");

        // Update personal best
        if (score > personalBest[msg.sender]) {
            personalBest[msg.sender] = score;
        }

        // Find the position for the new score
        uint256 position = leaderboard.length;
        for (uint256 i = 0; i < leaderboard.length; i++) {
            if (score > leaderboard[i].score) {
                position = i;
                break;
            }
        }

        // If the leaderboard is full and score is too low, don't add
        if (position >= MAX_SIZE) {
            emit ScoreSubmitted(msg.sender, score, highestTile, position + 1);
            return;
        }

        // Create new entry
        Entry memory newEntry = Entry({
            player: msg.sender,
            score: score,
            highestTile: highestTile,
            timestamp: block.timestamp
        });

        // Insert the new entry
        if (leaderboard.length < MAX_SIZE) {
            leaderboard.push(newEntry);
        }

        // Shift entries down to make room
        for (uint256 i = leaderboard.length - 1; i > position; i--) {
            leaderboard[i] = leaderboard[i - 1];
        }

        leaderboard[position] = newEntry;

        emit ScoreSubmitted(msg.sender, score, highestTile, position + 1);
    }

    // Get the top N scores
    function getTopScores(uint256 count) external view returns (Entry[] memory) {
        uint256 resultCount = count;
        if (resultCount > leaderboard.length) {
            resultCount = leaderboard.length;
        }

        Entry[] memory result = new Entry[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            result[i] = leaderboard[i];
        }

        return result;
    }

    // Get personal best score for a player
    function getPersonalBest(address player) external view returns (uint256) {
        return personalBest[player];
    }

    // Get total number of entries in the leaderboard
    function getLeaderboardSize() external view returns (uint256) {
        return leaderboard.length;
    }

    // Get a player's rank (1-indexed, 0 if not on leaderboard)
    function getPlayerRank(address player) external view returns (uint256) {
        for (uint256 i = 0; i < leaderboard.length; i++) {
            if (leaderboard[i].player == player) {
                return i + 1;
            }
        }
        return 0;
    }
}
