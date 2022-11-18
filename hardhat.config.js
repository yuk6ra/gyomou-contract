require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("hardhat-gas-reporter");
require("@nomiclabs/hardhat-etherscan");

module.exports = {
  solidity: "0.8.15",
  networks: {
    goerli: {
      url: process.env.STAGING_ALCHEMY_KEY,
      accounts: [process.env.PRIVATE_KEY],
    },
    mainnet: {
      url: process.env.STAGING_ALCHEMY_MAINNET_KEY,
      accounts: [process.env.PRIVATE_KEY],
    }
  },
  gasReporter: {
    enabled: true,
    outputFile: "gas-report.ans",
    currency: "ETH",
    noColors: false,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY,
  }
};