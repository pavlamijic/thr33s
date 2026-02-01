const hre = require("hardhat");

async function main() {
  console.log("Deploying Thr33sLeaderboard contract...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  const Thr33sLeaderboard = await hre.ethers.getContractFactory("Thr33sLeaderboard");
  const leaderboard = await Thr33sLeaderboard.deploy();

  await leaderboard.waitForDeployment();

  const contractAddress = await leaderboard.getAddress();
  console.log("\n========================================");
  console.log("Thr33sLeaderboard deployed to:", contractAddress);
  console.log("========================================\n");
  console.log("Update src/web3/config.ts with this address:");
  console.log(`contractAddress: '${contractAddress}' as Address,`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
