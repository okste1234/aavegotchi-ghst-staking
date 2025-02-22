// const { LedgerSigner } = require('@ethersproject/hardware-wallets')
const {
  LedgerSigner,
} = require("../../../aavegotchi-contracts/node_modules/@ethersproject/hardware-wallets/lib");
const { sendToMultisig } = require("../libraries/multisig/multisig.js");

let gasPrice = 20000000000;

function getSelectors(contract) {
  const signatures = Object.keys(contract.interface.functions);
  const selectors = signatures.reduce((acc, val) => {
    if (val !== "init(bytes)") {
      acc.push(contract.interface.getSighash(val));
    }
    return acc;
  }, []);
  return selectors;
}

function getSelector(func) {
  const abiInterface = new ethers.utils.Interface([func]);
  return abiInterface.getSighash(ethers.utils.Fragment.from(func));
}

async function main() {
  const diamondAddress = "0xA02d547512Bb90002807499F05495Fe9C4C3943f";
  let signer;
  let stakingFacet;
  let ticketsFacet;
  const owner = await (
    await ethers.getContractAt("OwnershipFacet", diamondAddress)
  ).owner();
  const testing = ["hardhat", "localhost"].includes(hre.network.name);

  if (testing) {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [owner],
    });
    signer = await ethers.getSigner(owner);
  } else if (hre.network.name === "matic") {
    signer = new LedgerSigner(ethers.provider);
  } else {
    throw Error("Incorrect network selected");
  }

  console.log("Deploying Ticket facet");
  const ticketFacet = await ethers.getContractFactory(
    "contracts/facets/TicketsFacet.sol:TicketsFacet"
  );
  ticketsFacet = await ticketFacet.deploy({ gasPrice: gasPrice });
  await ticketsFacet.deployed();
  console.log("Deployed ticketsFacet:", ticketsFacet.address);

  let existingTicketsFuncs = getSelectors(ticketsFacet);

  const FacetCutAction = { Add: 0, Replace: 1, Remove: 2 };

  const diamondCut = (
    await ethers.getContractAt("IDiamondCut", diamondAddress)
  ).connect(signer);
  let tx;
  let receipt;

  const cut = [
    {
      facetAddress: ticketsFacet.address,
      action: FacetCutAction.Replace,
      functionSelectors: existingTicketsFuncs,
    },
  ];

  if (testing) {
    console.log("Diamond cut");
    tx = await diamondCut.diamondCut(cut, ethers.constants.AddressZero, "0x", {
      gasLimit: 8000000,
    });
    receipt = await tx.wait();
    if (!receipt.status) {
      throw Error(`Staking Diamond upgrade failed: ${tx.hash}`);
    }

    console.log("Completed Diamond cut: ", tx.hash);
  } else {
    console.log("Diamond Cut");
    tx = await diamondCut.populateTransaction.diamondCut(
      cut,
      ethers.constants.AddressZero,
      "0x",
      { gasLimit: 800000 }
    );
    await sendToMultisig(process.env.DIAMOND_UPGRADER, signer, tx);
  }
}

main()
  .then(() => console.log("upgrade completed") /* process.exit(0) */)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

exports.MigrateTicketsFix = main;
