const main = async () => {
  const nftContractFactory = await hre.ethers.getContractFactory("GyomouNFT");
  const nftContract = await nftContractFactory.deploy(
    "0xa8EF929dB5653d0f882689549DA9267CcbeB1359",
    "500"
);
  await nftContract.deployed();
  console.log("Contract deployed to:", nftContract.address);

};

const runMain = async () => {
  try {
    await main();
    process.exit(0);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

runMain();